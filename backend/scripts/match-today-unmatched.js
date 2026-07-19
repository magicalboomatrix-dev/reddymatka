/**
 * Match Today's Unmatched Deposits
 * 
 * Uses existing project database connection to process today's unmatched transactions.
 * Follows same pattern as other working scripts in the project.
 * 
 * Usage: node scripts/match-today-unmatched.js
 */

require('dotenv').config();
const pool = require('../src/config/database');

/**
 * Parse UPI transaction data from webhook transaction
 */
function parseTransactionFromWebhook(webhookTxn) {
  try {
    const amount = parseFloat(webhookTxn.amount);
    const referenceNumber = webhookTxn.reference_number;
    const payerName = webhookTxn.payer_name;
    const txnTime = webhookTxn.txn_time;
    
    // Try to extract order reference from raw message
    let orderRef = null;
    if (webhookTxn.raw_message) {
      const orderRefMatch = webhookTxn.raw_message.match(/(?:order|ref|order.?ref|reference)[:\s]*([A-Z0-9]{6,12})/i);
      if (orderRefMatch) {
        orderRef = orderRefMatch[1].toUpperCase();
      }
    }
    
    return {
      amount,
      referenceNumber,
      payerName,
      txnTime,
      orderRef
    };
  } catch (error) {
    console.error('Error parsing transaction data:', error.message);
    return null;
  }
}

/**
 * Find matching pending order
 */
async function findMatchingOrder(conn, amount, orderRef) {
  const ORDER_EXPIRY_MINUTES = 4;
  const LATE_MATCH_GRACE_MINUTES = 0;
  
  let pendingOrders = [];
  let lateMatch = false;

  // Match by order reference first
  if (orderRef) {
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

    // Grace window for expired orders
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

  // Match by amount if no order reference match
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

    // Grace window for amount match
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

  return { pendingOrders, lateMatch };
}

/**
 * Process a single transaction
 */
async function processTransaction(conn, txn) {
  try {
    await conn.beginTransaction();
    
    // Parse transaction data
    const transactionData = parseTransactionFromWebhook(txn);
    if (!transactionData) {
      throw new Error('Failed to parse transaction data');
    }

    const { amount, referenceNumber, payerName, txnTime, orderRef } = transactionData;

    // Check for duplicate reference number
    const [existingRef] = await conn.query(
      'SELECT id FROM upi_webhook_transactions WHERE reference_number = ? AND id != ? LIMIT 1',
      [referenceNumber, txn.id]
    );
    if (existingRef.length > 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['duplicate', 'Duplicate reference number', txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'duplicate_reference' };
    }

    // Check against deposits UTR numbers
    const [existingDeposit] = await conn.query(
      'SELECT id FROM deposits WHERE utr_number = ? LIMIT 1',
      [referenceNumber]
    );
    if (existingDeposit.length > 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['duplicate', 'Reference already used in deposits', txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'duplicate_utr' };
    }

    // Validate amount range
    const minDeposit = 100;
    const maxDeposit = 50000;
    if (amount < minDeposit || amount > maxDeposit) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `Amount ${amount} outside range ${minDeposit}-${maxDeposit}`, txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'amount_out_of_range' };
    }

    // Find matching order
    const { pendingOrders, lateMatch } = await findMatchingOrder(conn, amount, orderRef);
    
    if (pendingOrders.length === 0) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `No pending order found for amount ${amount}`, txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'no_matching_order' };
    }

    const order = pendingOrders[0];

    // Strict amount validation
    const expectedAmount = parseFloat(order.pay_amount);
    if (!expectedAmount || amount !== expectedAmount) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', `Amount mismatch: received ${amount}, expected ${expectedAmount}`, txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'amount_mismatch' };
    }

    // Check user is not blocked
    const [userRows] = await conn.query(
      'SELECT id, is_blocked FROM users WHERE id = ? LIMIT 1',
      [order.user_id]
    );
    if (userRows.length === 0 || userRows[0].is_blocked) {
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', 'User blocked or not found', txn.id]
      );
      await conn.commit();
      return { matched: false, reason: 'user_blocked' };
    }

    // Create deposit record
    const creditAmount = Math.round(parseFloat(order.amount) * 100) / 100;
    const [depositResult] = await conn.query(
      `INSERT INTO deposits (user_id, amount, utr_number, webhook_txn_id, order_id, payer_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
      [order.user_id, creditAmount, referenceNumber, txn.id, order.id, payerName || null]
    );
    const depositId = depositResult.insertId;

    // Credit wallet
    await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [order.user_id]);
    await conn.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [creditAmount]);
    
    const [[walletRow]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [order.user_id]);
    const newBalance = parseFloat(walletRow.balance);
    
    await conn.query(
      `INSERT INTO wallet_transactions
        (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
       VALUES (?, 'deposit', ?, ?, 'completed', 'deposit', ?, ?)`,
      [order.user_id, creditAmount, newBalance, `deposit_${depositId}`, `Auto deposit via UPI (Ref: ${referenceNumber})`]
    );

    // Update order status
    await conn.query(
      'UPDATE pending_deposit_orders SET status = ?, matched_deposit_id = ?, matched_webhook_id = ? WHERE id = ?',
      ['matched', depositId, txn.id, order.id]
    );

    // Update webhook transaction status
    await conn.query(
      'UPDATE upi_webhook_transactions SET status = ?, matched_order_id = ?, matched_deposit_id = ?, match_attempted_at = NOW() WHERE id = ?',
      ['matched', order.id, depositId, txn.id]
    );

    // Notify user
    await conn.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [order.user_id, 'deposit', `Your deposit of Rs.${creditAmount} has been automatically verified and credited. Ref: ${referenceNumber}`]
    );

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
      await conn.query(
        'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
        ['unmatched', error.message?.substring(0, 490), txn.id]
      );
    } catch (_) { /* Ignore logging errors */ }

    throw error;
  }
}

/**
 * Main function to match today's unmatched transactions
 */
async function matchTodaysUnmatchedDeposits() {
  try {
    console.log('Starting to match today\'s unmatched deposits...');
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Query today's unmatched transactions
    const [unmatchedTxns] = await pool.query(`
      SELECT id, raw_message, amount, reference_number, payer_name, txn_time, 
             created_at, match_attempted_at, error_message
      FROM upi_webhook_transactions 
      WHERE status = 'unmatched' 
        AND DATE(created_at) = ?
        AND match_attempted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 100
    `, [today]);
    
    if (unmatchedTxns.length === 0) {
      console.log(`No unmatched transactions found for today (${today})`);
      return { processed: 0, matched: 0, failed: 0 };
    }
    
    console.log(`Found ${unmatchedTxns.length} unmatched transactions for today`);
    
    let processed = 0;
    let matched = 0;
    let failed = 0;
    
    for (const txn of unmatchedTxns) {
      processed++;
      console.log(`\nProcessing transaction ${processed}/${unmatchedTxns.length}:`);
      console.log(`  ID: ${txn.id}`);
      console.log(`  Amount: ${txn.amount}`);
      console.log(`  Reference: ${txn.reference_number}`);
      console.log(`  Created: ${txn.created_at}`);
      
      try {
        const result = await processTransaction(pool, txn);
        
        if (result.matched) {
          matched++;
          console.log(`  SUCCESS: Matched to order ${result.orderId}, deposit ID ${result.depositId}`);
          console.log(`  User ${result.userId} credited with amount ${result.amount}, new balance: ${result.newBalance}`);
        } else {
          failed++;
          console.log(`  FAILED: ${result.reason}`);
        }
      } catch (error) {
        failed++;
        console.log(`  ERROR: ${error.message}`);
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Processed: ${processed}`);
    console.log(`Matched: ${matched}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${processed > 0 ? ((matched / processed) * 100).toFixed(1) : 0}%`);
    
    return { processed, matched, failed };
    
  } catch (error) {
    console.error('Error in matchTodaysUnmatchedDeposits:', error);
    throw error;
  }
}

// Main execution using same pattern as other scripts
(async () => {
  try {
    console.log('=== Match Today\'s Unmatched Deposits ===');
    console.log('');
    
    const result = await matchTodaysUnmatchedDeposits();
    console.log('\nScript completed successfully!');
    
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();

module.exports = { matchTodaysUnmatchedDeposits };
