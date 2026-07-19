/**
 * Auto Deposit Retry Service
 * Periodically re-attempts matching for 'unmatched' and 'received' webhook transactions
 * that failed initial matching (e.g., order was created after the SMS arrived).
 *
 * Run interval: every 10 seconds
 * Only retries transactions from the last 15 minutes (within order expiry + grace window).
 */

const pool = require('../config/database');
const { matchAndCreditDeposit, ORDER_EXPIRY_MINUTES, LATE_MATCH_GRACE_MINUTES } = require('./auto-deposit-matcher');
const logger = require('../utils/logger');

let retryInterval = null;
const RETRY_INTERVAL_MS = 10_000; // 10 seconds
const MAX_AGE_MINUTES = ORDER_EXPIRY_MINUTES + LATE_MATCH_GRACE_MINUTES + 5;
const BATCH_SIZE = 10; // Process up to 10 at a time

async function retryUnmatchedTransactions() {
  try {
    // Find unmatched/received transactions that haven't been retried recently
    const [rows] = await pool.query(
      `SELECT id, amount, reference_number, payer_name, txn_time, raw_message
       FROM upi_webhook_transactions
       WHERE status IN ('unmatched', 'received')
         AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND (match_attempted_at IS NULL OR match_attempted_at < DATE_SUB(NOW(), INTERVAL 10 SECOND))
       ORDER BY created_at ASC
       LIMIT ?`,
      [MAX_AGE_MINUTES, BATCH_SIZE]
    );

    if (rows.length === 0) return;

    logger.info('auto-deposit-retry', `Retry cycle: ${rows.length} transaction(s) to process`);

    let matched = 0;
    for (const txn of rows) {
      try {
        // Re-parse order_ref from the raw message (in case it was missed)
        let orderRef = null;
        if (txn.raw_message) {
          const refMatch = txn.raw_message.match(/\bRM([A-Z0-9]{6})\b/i);
          if (refMatch) {
            orderRef = 'RM' + refMatch[1].toUpperCase();
          }
        }

        const result = await matchAndCreditDeposit({
          amount: parseFloat(txn.amount),
          referenceNumber: txn.reference_number,
          payerName: txn.payer_name,
          txnTime: txn.txn_time,
          webhookTxnId: txn.id,
          orderRef,
        });

        if (result.matched) {
          matched++;
          logger.info('auto-deposit-retry', 'Retry matched and credited', {
            webhookTxnId: txn.id,
            orderId: result.orderId,
            depositId: result.depositId,
            amount: txn.amount,
            referenceNumber: txn.reference_number,
          });
        }
        // If not matched, matchAndCreditDeposit already updated match_attempted_at
      } catch (err) {
        // Individual retry failure — log and continue with next
        logger.error('auto-deposit-retry', 'Retry error for txn', {
          webhookTxnId: txn.id,
          error: err.message,
        });
      }
    }

    if (matched > 0) {
      logger.info('auto-deposit-retry', `Retry cycle complete: ${matched}/${rows.length} matched`);
    }
  } catch (err) {
    logger.error('auto-deposit-retry', 'Retry batch error', err);
  }
}

function startRetryWorker() {
  if (retryInterval) return;
  logger.info('auto-deposit-retry', `Starting unmatched transaction retry worker (every ${RETRY_INTERVAL_MS / 1000}s)`);
  retryInterval = setInterval(retryUnmatchedTransactions, RETRY_INTERVAL_MS);
  // Run once immediately
  retryUnmatchedTransactions();
}

function stopRetryWorker() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    logger.info('auto-deposit-retry', 'Retry worker stopped');
  }
}

module.exports = { startRetryWorker, stopRetryWorker, retryUnmatchedTransactions };
