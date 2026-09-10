/**
 * Deposit Controller for Juspay Payment Gateway
 */

const pool = require('../config/database');
const juspayService = require('../services/juspay.service');
const { clampPagination } = require('../utils/pagination');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const eventBus = require('../utils/event-bus');
const logger = require('../utils/logger');

async function getDepositLimits() {
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?, ?)',
      ['min_deposit', 'max_deposit']
    );
    const map = {};
    for (const r of rows) map[r.setting_key] = r.setting_value;
    return {
      minDeposit: parseFloat(map.min_deposit) || 100,
      maxDeposit: parseFloat(map.max_deposit) || 50000,
    };
  } catch (err) {
    logger.warn('deposit', 'Failed to read deposit limits from settings, using defaults', err);
    return { minDeposit: 100, maxDeposit: 50000 };
  }
}

function getFrontendBaseUrl() {
  const origin = process.env.FRONTEND_URL?.split(',')[0]?.trim();
  return origin || 'http://localhost:3000';
}

/**
 * POST /api/deposits/create-order
 * User creates a new deposit order to initiate payment via Juspay
 */
exports.createDepositOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Deposit amount is required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid deposit amount.' });
    }

    const { minDeposit, maxDeposit } = await getDepositLimits();
    if (parsedAmount < minDeposit) {
      return res.status(400).json({ error: `Minimum deposit amount is ₹${minDeposit}.` });
    }
    if (parsedAmount > maxDeposit) {
      return res.status(400).json({ error: `Maximum deposit amount is ₹${maxDeposit.toLocaleString('en-IN')}.` });
    }

    // Check if user is blocked
    const [userRows] = await pool.query('SELECT id, name, phone, is_blocked FROM users WHERE id = ? LIMIT 1', [userId]);
    if (userRows.length === 0 || userRows[0].is_blocked) {
      return res.status(403).json({ error: 'Account is suspended or inactive.' });
    }
    const user = userRows[0];

    // Generate unique order reference: ORD_<timestamp>_<userId>
    const orderId = `ORD_${Date.now()}_${userId}`;
    const returnUrl = `${getFrontendBaseUrl()}/deposit/status?order_id=${encodeURIComponent(orderId)}`;

    // Create pending deposit record in database
    await pool.query(
      `INSERT INTO deposits (user_id, order_id, amount, currency, status, gateway)
       VALUES (?, ?, ?, 'INR', 'pending', 'juspay')`,
      [userId, orderId, parsedAmount]
    );

    // Call Juspay to initiate checkout session
    const paymentSession = await juspayService.createPaymentOrder({
      orderId,
      amount: parsedAmount,
      customerId: userId,
      customerPhone: user.phone,
      customerEmail: `${user.phone}@reddymatka.com`,
      returnUrl,
    });

    // Update deposit record with payment URL and gateway order ID
    await pool.query(
      'UPDATE deposits SET gateway_order_id = ?, payment_url = ? WHERE order_id = ?',
      [paymentSession.gatewayOrderId, paymentSession.paymentUrl, orderId]
    );

    try {
      eventBus.emit('deposit_order_created', { orderId, userId, amount: parsedAmount });
    } catch {}

    res.status(201).json({
      success: true,
      orderId,
      amount: parsedAmount,
      currency: 'INR',
      paymentUrl: paymentSession.paymentUrl,
      sdkPayload: paymentSession.sdkPayload,
      isMock: !!paymentSession.isMock,
    });
  } catch (error) {
    logger.error('deposit', 'Failed to create deposit order', error);
    next(error);
  }
};

/**
 * Helper: Atomically credit wallet and finalize deposit
 */
async function finalizeDepositCredit({ depositId, orderId, userId, amount, gatewayTxnId, utrNumber, paymentMethod, rawResponse }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock deposit row to prevent race conditions
    const [deposits] = await conn.query(
      'SELECT id, status, amount, user_id FROM deposits WHERE id = ? FOR UPDATE',
      [depositId]
    );

    if (deposits.length === 0) {
      await conn.rollback();
      return { alreadyProcessed: false, notFound: true };
    }

    if (deposits[0].status === 'completed') {
      await conn.rollback();
      return { alreadyProcessed: true, deposit: deposits[0] };
    }

    // Update deposit status
    await conn.query(
      `UPDATE deposits
       SET status = 'completed',
           gateway_txn_id = COALESCE(?, gateway_txn_id),
           utr_number = COALESCE(?, utr_number),
           payment_method = COALESCE(?, payment_method),
           raw_response = COALESCE(?, raw_response)
       WHERE id = ?`,
      [
        gatewayTxnId || null,
        utrNumber || null,
        paymentMethod || 'UPI',
        rawResponse ? JSON.stringify(rawResponse) : null,
        depositId,
      ]
    );

    // Credit user wallet atomically via wallet-ledger
    await recordWalletTransaction(conn, {
      userId,
      type: 'deposit',
      amount,
      referenceType: 'deposit',
      referenceId: orderId,
      status: 'completed',
      remark: `Deposit via Juspay (${orderId})`,
    });

    // Create user notification
    await conn.query(
      `INSERT INTO notifications (user_id, type, message)
       VALUES (?, 'deposit', ?)`,
      [userId, `Your deposit of ₹${parseFloat(amount).toLocaleString('en-IN')} has been successfully credited.`]
    );

    // Process referral bonus if this is the user's first completed deposit
    try {
      const [priorDeposits] = await conn.query(
        "SELECT COUNT(*) AS cnt FROM deposits WHERE user_id = ? AND status = 'completed' AND id != ?",
        [userId, depositId]
      );
      if (Number(priorDeposits[0]?.cnt || 0) === 0) {
        const [pendingReferrals] = await conn.query(
          "SELECT id, referrer_id, bonus_amount FROM referrals WHERE referred_user_id = ? AND status = 'pending' LIMIT 1",
          [userId]
        );
        if (pendingReferrals.length > 0) {
          const ref = pendingReferrals[0];
          const bonusAmt = parseFloat(ref.bonus_amount || 0);
          if (bonusAmt > 0) {
            await conn.query(
              'UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?',
              [bonusAmt, userId]
            );
            await conn.query(
              "UPDATE referrals SET status = 'credited', credited_at = NOW() WHERE id = ?",
              [ref.id]
            );
            await conn.query(
              "INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, 'referral', ?, ?)",
              [userId, bonusAmt, orderId]
            );
            await conn.query(
              `INSERT INTO notifications (user_id, type, message)
               VALUES (?, 'system', ?)`,
              [userId, `You received a ₹${bonusAmt} welcome bonus on your first deposit!`]
            );
            logger.info('deposit', `Credited referral bonus of ₹${bonusAmt} to user ${userId}`);
          }
        }
      }
    } catch (refErr) {
      logger.warn('deposit', `Failed to process referral bonus for user ${userId}`, refErr);
    }

    await conn.commit();

    logger.info('deposit', `Successfully credited deposit #${depositId} (order ${orderId}) for user ${userId}: ₹${amount}`);

    // Emit real-time events outside transaction
    try {
      eventBus.emit('deposit:credited', { userId, amount, orderId });
    } catch {}

    return { alreadyProcessed: false, success: true };
  } catch (err) {
    await conn.rollback();
    logger.error('deposit', `Failed to finalize deposit credit for ${orderId}`, err);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * GET /api/deposits/order-status/:orderId
 * Check order status with auto-reconcile against Juspay
 */
exports.getOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    const [rows] = await pool.query(
      `SELECT d.id, d.user_id, d.order_id, d.amount, d.currency, d.status,
              d.gateway, d.gateway_order_id, d.gateway_txn_id, d.payment_method,
              d.payment_url, d.utr_number, d.created_at, d.updated_at,
              u.name AS user_name, u.phone AS user_phone
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE d.order_id = ?
       LIMIT 1`,
      [orderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deposit order not found.' });
    }

    const deposit = rows[0];

    // Ensure non-admin users only view their own orders
    if (!isAdmin && deposit.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    // If still pending, query Juspay API directly to auto-reconcile
    if (deposit.status === 'pending') {
      const isMock = req.query.mock === 'true' && juspayService.isMockEnabled();

      let juspayStatus = { status: 'pending' };
      if (!isMock) {
        juspayStatus = await juspayService.getOrderStatus(orderId);
      }

      if (juspayStatus.status === 'completed' || isMock) {
        await finalizeDepositCredit({
          depositId: deposit.id,
          orderId: deposit.order_id,
          userId: deposit.user_id,
          amount: deposit.amount,
          gatewayTxnId: juspayStatus.gatewayTxnId || `MOCK_TXN_${Date.now()}`,
          utrNumber: juspayStatus.utrNumber || `UTR${Date.now()}`,
          paymentMethod: juspayStatus.paymentMethod || 'UPI',
          rawResponse: juspayStatus.raw || { simulated: true, mock: true },
        });
        deposit.status = 'completed';
      } else if (juspayStatus.status === 'failed') {
        await pool.query('UPDATE deposits SET status = ? WHERE id = ?', ['failed', deposit.id]);
        deposit.status = 'failed';
      }
    }

    res.json({
      success: true,
      deposit,
    });
  } catch (error) {
    logger.error('deposit', 'Error in getOrderStatus', error);
    next(error);
  }
};

/**
 * POST /api/deposits/webhook
 * Receives real-time payment notifications from Juspay
 */
exports.handleWebhook = async (req, res) => {
  try {
    const payload = req.body;
    logger.info('deposit-webhook', 'Received Juspay webhook payload', { payload });

    const parsed = juspayService.parseWebhookPayload(payload);
    if (!parsed || !parsed.orderId) {
      logger.warn('deposit-webhook', 'Ignored invalid webhook payload: missing orderId');
      return res.status(200).json({ status: 'ignored', reason: 'Missing order_id' });
    }

    const { orderId, status, amount, gatewayTxnId, utrNumber, paymentMethod, raw } = parsed;

    const [existing] = await pool.query(
      'SELECT id, user_id, amount, status FROM deposits WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (existing.length === 0) {
      logger.warn('deposit-webhook', `Webhook order not found in DB: ${orderId}`);
      return res.status(200).json({ status: 'ignored', reason: 'Order not found' });
    }

    const deposit = existing[0];

    if (deposit.status === 'completed') {
      logger.info('deposit-webhook', `Order ${orderId} already completed, acknowledging`);
      return res.status(200).json({ status: 'already_completed' });
    }

    if (status === 'completed') {
      await finalizeDepositCredit({
        depositId: deposit.id,
        orderId,
        userId: deposit.user_id,
        amount: deposit.amount,
        gatewayTxnId,
        utrNumber,
        paymentMethod,
        rawResponse: raw,
      });
      logger.info('deposit-webhook', `Successfully credited order ${orderId} via webhook`);
    } else if (status === 'failed' || status === 'cancelled') {
      await pool.query(
        'UPDATE deposits SET status = ?, raw_response = ? WHERE id = ?',
        [status, JSON.stringify(raw), deposit.id]
      );
      logger.info('deposit-webhook', `Order ${orderId} marked as ${status}`);
    }

    return res.status(200).json({ status: 'ok', order_id: orderId });
  } catch (err) {
    logger.error('deposit-webhook', 'Webhook processing error', err);
    // Respond 200 to prevent webhook delivery storms while logging the error
    return res.status(200).json({ status: 'error', error: err.message });
  }
};

/**
 * GET /api/deposits/my-deposits
 * User's deposit history
 */
exports.getMyDeposits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM deposits WHERE user_id = ?',
      [userId]
    );

    const [deposits] = await pool.query(
      `SELECT id, order_id, amount, currency, status, gateway, payment_method, utr_number, created_at
       FROM deposits
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    res.json({
      deposits,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/deposits/all
 * Admin and Moderator endpoint to view all deposits
 */
exports.getAllDeposits = async (req, res, next) => {
  try {
    const { search, from_date, to_date, moderator_id, status } = req.query;
    const { page, limit, offset } = clampPagination(req.query);
    const isModerator = req.user.role === 'moderator';

    const whereConditions = [];
    const queryParams = [];

    if (isModerator) {
      whereConditions.push('u.moderator_id = ?');
      queryParams.push(req.user.id);
    } else if (moderator_id) {
      whereConditions.push('u.moderator_id = ?');
      queryParams.push(moderator_id);
    }

    if (status) {
      whereConditions.push('d.status = ?');
      queryParams.push(status);
    }

    if (from_date) {
      whereConditions.push('DATE(d.created_at) >= ?');
      queryParams.push(from_date);
    }

    if (to_date) {
      whereConditions.push('DATE(d.created_at) <= ?');
      queryParams.push(to_date);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(
        u.name LIKE ? OR
        u.phone LIKE ? OR
        d.order_id LIKE ? OR
        d.utr_number LIKE ? OR
        d.gateway_txn_id LIKE ? OR
        CAST(d.id AS CHAR) LIKE ?
      )`);
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM deposits d JOIN users u ON d.user_id = u.id ${whereClause}`,
      queryParams
    );

    const [deposits] = await pool.query(
      `SELECT d.id, d.user_id, d.order_id, d.amount, d.currency, d.status,
              d.gateway, d.gateway_order_id, d.gateway_txn_id, d.payment_method,
              d.utr_number, d.created_at,
              u.name AS user_name, u.phone AS user_phone,
              u.moderator_id,
              moderator_user.name AS moderator_name
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      deposits,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};
