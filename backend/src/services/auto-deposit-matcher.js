/**
 * Auto Deposit Matcher
 * Matches incoming UPI transactions (from Telegram) to pending deposit orders.
 * Handles wallet crediting, bonus application, and notification in a single atomic transaction.
 */

const pool = require('../config/database');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const ORDER_EXPIRY_MINUTES = Math.max(1, parseNonNegativeInt(process.env.AUTO_DEPOSIT_ORDER_EXPIRY_MINUTES, 4));
const LATE_MATCH_GRACE_MINUTES = parseNonNegativeInt(process.env.AUTO_DEPOSIT_LATE_MATCH_GRACE_MINUTES, 0);
const DEFAULT_MIN_DEPOSIT = 100;
const DEFAULT_MAX_DEPOSIT = 50000;

/**
 * Fetches min/max deposit limits from the settings table.
 */
async function getDepositLimits(conn) {
  const queryTarget = conn || pool;
  const [rows] = await queryTarget.query(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('min_deposit', 'max_deposit')"
  );
  const map = rows.reduce((acc, r) => { acc[r.setting_key] = r.setting_value; return acc; }, {});
  return {
    minDeposit: Number(map.min_deposit) || DEFAULT_MIN_DEPOSIT,
    maxDeposit: Number(map.max_deposit) || DEFAULT_MAX_DEPOSIT,
  };
}

/**
 * Attempts to match a parsed UPI transaction to a pending deposit order.
 * Matching priority:
 *   1. By order_ref (if found in the message) — exact, fraud-proof
 *   2. By pay_amount (unique paise) — highly reliable
 * If neither matches, the transaction is marked 'unmatched'.
 * Returns { matched: true/false, ... } with details.
 */
async function matchAndCreditDeposit({ amount, referenceNumber, payerName, txnTime, webhookTxnId, orderRef }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Check duplicate reference number across ALL tables
    const [existingRef] = await conn.query(
      'SELECT id FROM upi_webhook_transactions WHERE reference_number = ? AND id != ? LIMIT 1',
      [referenceNumber, webhookTxnId]
    );
    if (existingRef.length > 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['duplicate', 'Duplicate reference number', webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, action: 'duplicate_ref', details: `Reference ${referenceNumber} already exists` });
      await conn.commit();
      return { matched: false, reason: 'duplicate_reference' };
    }

    // Also check against existing deposits UTR numbers
    const [existingDeposit] = await conn.query(
      'SELECT id FROM deposits WHERE utr_number = ? LIMIT 1',
      [referenceNumber]
    );
    if (existingDeposit.length > 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['duplicate', 'Reference already used in deposits', webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, action: 'duplicate_utr', details: `UTR ${referenceNumber} already in deposits table` });
      await conn.commit();
      return { matched: false, reason: 'duplicate_utr' };
    }

    // 2. Validate amount range
    const { minDeposit, maxDeposit } = await getDepositLimits(conn);
    if (amount < minDeposit || amount > maxDeposit) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `Amount ${amount} outside range ${minDeposit}-${maxDeposit}`, webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, action: 'amount_out_of_range', details: `Amount: ${amount}` });
      await conn.commit();
      return { matched: false, reason: 'amount_out_of_range' };
    }

    // 3. Find matching pending order (priority: order_ref → pay_amount)
    //    Also checks recently-expired orders within a grace window so that
    //    late-arriving Telegram messages (bank SMS delay) can still be credited.
    let pendingOrders = [];
    let lateMatch = false;

    // 3a. Match by order reference code (most precise)
    if (orderRef) {
      // First try active pending orders
      const [refMatch] = await conn.query(
        `SELECT id, user_id, amount, pay_amount, order_ref
         FROM pending_deposit_orders
         WHERE status = 'pending'
           AND order_ref = ?
           AND expires_at > NOW()
         LIMIT 1
         FOR UPDATE`,
        [orderRef]
      );
      pendingOrders = refMatch;

      // Grace window: also match recently-expired orders (within LATE_MATCH_GRACE_MINUTES)
      if (pendingOrders.length === 0) {
        const [lateRefMatch] = await conn.query(
          `SELECT id, user_id, amount, pay_amount, order_ref
           FROM pending_deposit_orders
           WHERE status = 'expired'
             AND order_ref = ?
             AND expires_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
           LIMIT 1
           FOR UPDATE`,
          [orderRef, LATE_MATCH_GRACE_MINUTES]
        );
        if (lateRefMatch.length > 0) {
          pendingOrders = lateRefMatch;
          lateMatch = true;
        }
      }
    }

    // 3b. Match by unique pay_amount (paise-level)
    if (pendingOrders.length === 0) {
      const [amountMatch] = await conn.query(
        `SELECT id, user_id, amount, pay_amount, order_ref
         FROM pending_deposit_orders
         WHERE status = 'pending'
           AND pay_amount = ?
           AND expires_at > NOW()
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        [amount]
      );
      pendingOrders = amountMatch;

      // Grace window for pay_amount match on recently-expired orders
      if (pendingOrders.length === 0) {
        const [lateAmountMatch] = await conn.query(
          `SELECT id, user_id, amount, pay_amount, order_ref
           FROM pending_deposit_orders
           WHERE status = 'expired'
             AND pay_amount = ?
             AND expires_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE`,
          [amount, LATE_MATCH_GRACE_MINUTES]
        );
        if (lateAmountMatch.length > 0) {
          pendingOrders = lateAmountMatch;
          lateMatch = true;
        }
      }
    }

    if (pendingOrders.length === 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `No pending order found for amount ${amount}`, webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, action: 'no_matching_order', details: `Amount: ${amount}` });
      await conn.commit();
      return { matched: false, reason: 'no_matching_order' };
    }

    const order = pendingOrders[0];

    // 4. Strict amount validation — pay_amount must match exactly
    const expectedAmount = parseFloat(order.pay_amount);
    if (!expectedAmount || amount !== expectedAmount) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `Amount mismatch: received ${amount}, expected ${expectedAmount}`, webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, orderId: order.id, action: 'amount_mismatch', details: `Received: ${amount}, Expected: ${expectedAmount}` });
      await conn.commit();
      return { matched: false, reason: 'amount_mismatch' };
    }

    // 5. Check user is not blocked
    const [userRows] = await conn.query(
      'SELECT id, is_blocked, moderator_id FROM users WHERE id = ? LIMIT 1',
      [order.user_id]
    );
    if (userRows.length === 0 || userRows[0].is_blocked) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', 'User blocked or not found', webhookTxnId]
      );
      await logAutoDeposit(conn, { webhookTxnId, orderId: order.id, userId: order.user_id, action: 'user_blocked', details: 'User is blocked or not found' });
      await conn.commit();
      return { matched: false, reason: 'user_blocked' };
    }

    // 6. Create deposit record (credit the base order amount, not the pay_amount with paise)
    const creditAmount = Math.round(parseFloat(order.amount) * 100) / 100;
    const [depositResult] = await conn.query(
      `INSERT INTO deposits (user_id, amount, utr_number, webhook_txn_id, order_id, payer_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
      [order.user_id, creditAmount, referenceNumber, webhookTxnId, order.id, payerName || null]
    );
    const depositId = depositResult.insertId;

    // 7. Idempotency guard before crediting wallet
    const [existingCredit] = await conn.query(
      'SELECT id FROM wallet_transactions WHERE user_id = ? AND type = ? AND reference_type = ? AND reference_id = ? LIMIT 1',
      [order.user_id, 'deposit', 'deposit', `deposit_${depositId}`]
    );
    if (existingCredit.length > 0) {
      await conn.rollback();
      return { matched: false, reason: 'already_credited' };
    }

    // 8. Credit wallet (base order amount)
    const newBalance = await recordWalletTransaction(conn, {
      userId: order.user_id,
      type: 'deposit',
      amount: creditAmount,
      referenceType: 'deposit',
      referenceId: `deposit_${depositId}`,
      remark: `Auto deposit via UPI (Ref: ${referenceNumber})`,
    });

    // 9. Apply bonuses (same logic as manual approval)
    await applyDepositBonuses(conn, { depositId, userId: order.user_id, amount: creditAmount });

    // 10. Update order status (works for both 'pending' and late-matched 'expired' orders)
    await conn.query(
      'UPDATE pending_deposit_orders SET status = ?, matched_deposit_id = ?, matched_webhook_id = ? WHERE id = ?',
      ['matched', depositId, webhookTxnId, order.id]
    );

    if (lateMatch) {
      logger.info('auto-deposit', 'Late payment matched after order expiry (grace period)', {
        orderId: order.id,
        userId: order.user_id,
        amount,
        referenceNumber,
      });
    }

    // 11. Update webhook transaction status
    await conn.query(
      'UPDATE upi_webhook_transactions SET status = ?, matched_order_id = ?, matched_deposit_id = ?, match_attempted_at = NOW() WHERE id = ?',
      ['matched', order.id, depositId, webhookTxnId]
    );

    // 12. Notify user
    await conn.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [order.user_id, 'deposit', `Your deposit of ₹${creditAmount} has been automatically verified and credited. Ref: ${referenceNumber}`]
    );

    // 13. Audit log
    await logAutoDeposit(conn, {
      webhookTxnId,
      orderId: order.id,
      depositId,
      userId: order.user_id,
      action: 'matched_and_credited',
      details: JSON.stringify({ amount, creditAmount, referenceNumber, parsedOrderRef: orderRef, matchedOrderRef: order.order_ref, payerName, txnTime, newBalance }),
    });

    await conn.commit();

    return {
      matched: true,
      depositId,
      orderId: order.id,
      userId: order.user_id,
      amount,
      referenceNumber,
      matchedOrderRef: order.order_ref,
      newBalance,
    };
  } catch (error) {
    await conn.rollback();

    // Log the failure
    try {
      await pool.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', error.message?.substring(0, 490), webhookTxnId]
      );
      await pool.query(
        'INSERT INTO auto_deposit_logs (webhook_txn_id, action, details) VALUES (?, ?, ?)',
        [webhookTxnId, 'match_error', error.message?.substring(0, 990)]
      );
    } catch (_) { /* Ignore logging errors */ }

    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Apply first-deposit, slab, and pending referral bonuses
 */
async function applyDepositBonuses(conn, { depositId, userId, amount }) {
  // First deposit bonus
  const [depositCount] = await conn.query(
    'SELECT COUNT(*) as count FROM deposits WHERE user_id = ? AND status = ?',
    [userId, 'completed']
  );

  if (depositCount[0].count === 1) {
    const [bonusSettings] = await conn.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'first_deposit_bonus_percent'"
    );

    if (bonusSettings.length > 0) {
      const bonusPercent = parseFloat(bonusSettings[0].setting_value);
      if (bonusPercent > 0) {
        const bonusAmount = Math.round((parseFloat(amount) * bonusPercent) / 100 * 100) / 100;

        await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
        await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?', [bonusAmount, userId]);
        await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
          [userId, 'first_deposit', bonusAmount, `deposit_${depositId}`]);

        const [[walletRow]] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [userId]);
        const effectiveBalance = parseFloat(walletRow.balance) + parseFloat(walletRow.bonus_balance);
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
          [userId, bonusAmount, effectiveBalance, `first_deposit_${depositId}`, `First deposit bonus ${bonusPercent}%`]
        );
      }
    }
  }

  // Credit pending referral bonus to this user on first deposit
  if (depositCount[0].count === 1) {
    const [pendingReferrals] = await conn.query(
      "SELECT id, referrer_id, bonus_amount FROM referrals WHERE referred_user_id = ? AND status = 'pending' LIMIT 1",
      [userId]
    );

    if (pendingReferrals.length > 0) {
      const referral = pendingReferrals[0];
      const refBonus = parseFloat(referral.bonus_amount);

      if (refBonus > 0) {
        // Credit bonus to the referred user (the one making the deposit)
        await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
        await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?', [refBonus, userId]);

        await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
          [userId, 'referral', refBonus, `ref_signup_${referral.referrer_id}`]);

        const [[refWalletRow]] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [userId]);
        const refEffBalance = parseFloat(refWalletRow.balance) + parseFloat(refWalletRow.bonus_balance);
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
          [userId, refBonus, refEffBalance, `referral_bonus_${referral.id}`, 'Referral signup bonus (credited on first deposit)']
        );

        // Mark referral as credited
        await conn.query(
          "UPDATE referrals SET status = 'credited', credited_at = NOW() WHERE id = ?",
          [referral.id]
        );
      }
    }
  }

  // Slab bonus (highest matching slab only)
  const slabKeys = ['bonus_slab_10000', 'bonus_slab_5000', 'bonus_slab_2500'];
  for (const key of slabKeys) {
    const threshold = parseInt(key.split('_').pop());
    if (parseFloat(amount) >= threshold) {
      const [slabSettings] = await conn.query("SELECT setting_value FROM settings WHERE setting_key = ?", [key]);
      if (slabSettings.length > 0) {
        const slabBonus = parseFloat(slabSettings[0].setting_value);
        if (slabBonus > 0) {
          await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
          await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?', [slabBonus, userId]);
          await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
            [userId, 'slab', slabBonus, `deposit_${depositId}_slab_${threshold}`]);

          const [[walletRow]] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [userId]);
          const effectiveBalance = parseFloat(walletRow.balance) + parseFloat(walletRow.bonus_balance);
          await conn.query(
            `INSERT INTO wallet_transactions
              (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
             VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
            [userId, slabBonus, effectiveBalance, `slab_${depositId}_${threshold}`, `Slab bonus for ₹${threshold}+ deposit`]
          );
        }
        break; // Only apply highest matching slab
      }
    }
  }
}

async function logAutoDeposit(conn, { webhookTxnId = null, orderId = null, depositId = null, userId = null, action, details = null }) {
  await conn.query(
    'INSERT INTO auto_deposit_logs (webhook_txn_id, order_id, deposit_id, user_id, action, details) VALUES (?, ?, ?, ?, ?, ?)',
    [webhookTxnId, orderId, depositId, userId, action, details?.substring(0, 990) || null]
  );
}

/**
 * Expire stale pending orders (run periodically)
 */
async function expirePendingOrders() {
  // Get orders that are about to expire with user details
  const [ordersToExpire] = await pool.query(
    `SELECT pdo.id, pdo.user_id, pdo.amount, u.moderator_id
     FROM pending_deposit_orders pdo
     JOIN users u ON u.id = pdo.user_id
     WHERE pdo.status = 'pending' AND pdo.expires_at <= NOW()`
  );

  // Update status
  const [result] = await pool.query(
    "UPDATE pending_deposit_orders SET status = 'expired' WHERE status = 'pending' AND expires_at <= NOW()"
  );

  // Emit events for each expired order
  for (const order of ordersToExpire) {
    eventBus.emit('deposit_order_expired', {
      orderId: order.id,
      userId: order.user_id,
      amount: order.amount,
      moderatorId: order.moderator_id,
    });
  }

  return result.affectedRows;
}

module.exports = { matchAndCreditDeposit, expirePendingOrders, getDepositLimits, applyDepositBonuses, ORDER_EXPIRY_MINUTES, LATE_MATCH_GRACE_MINUTES };
