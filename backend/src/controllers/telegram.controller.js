/**
 * Telegram Webhook Controller
 * Receives forwarded UPI bank SMS messages from a Telegram bot and triggers auto-deposit matching.
 */

const pool = require('../config/database');
const { parseUpiMessage } = require('../services/upi-message-parser');
const { matchAndCreditDeposit } = require('../services/auto-deposit-matcher');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * POST /api/telegram/webhook/:token
 * Telegram sends updates here. The :token must match TELEGRAM_WEBHOOK_SECRET.
 */
exports.handleWebhook = async (req, res) => {
  // Respond immediately to Telegram (must respond within a few seconds)
  res.sendStatus(200);

  try {
    const update = req.body;

    // Support both regular messages and channel posts
    const message = update?.message || update?.channel_post;
    if (!message) {
      return;
    }

    // Extract text from message.text, message.caption (for photo/document forwards),
    // or forwarded message content — SMS forwarder bots often use caption
    const rawText = message.text || message.caption;
    if (!rawText) {
      return;
    }

    const chatId = String(message.chat?.id || '');
    const messageId = String(message.message_id || '');

    // Only accept messages from the configured chat
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    if (allowedChatId && chatId !== String(allowedChatId)) {
      logger.warn('telegram', 'Message from unauthorized chat', { chatId, allowedChatId: String(allowedChatId), messageText: rawText?.substring(0, 80) });
      return;
    }

    // Skip system alert messages (not UPI messages)
    if (rawText.includes('Ledger Drift Detected') || rawText.includes('REDDYMATKA — Ledger') || rawText.startsWith('🔴 **REDDYMATKA')) {
      logger.info('telegram', 'Skipping system alert message', { messageId, preview: rawText.substring(0, 60) });
      return;
    }

    // Check if this message was already processed (idempotency)
    const [existing] = await pool.query(
      `SELECT id FROM upi_webhook_transactions
       WHERE telegram_message_id = ? AND telegram_chat_id = ? AND status != 'parse_error' LIMIT 1`,
      [messageId, chatId]
    );
    if (existing.length > 0) {
      return;
    }

    // Parse the UPI message
    const parsed = parseUpiMessage(rawText);

    if (!parsed.success) {
      // Store the unparseable message for debugging (upsert so retries overwrite the old error row)
      await pool.query(
        `INSERT INTO upi_webhook_transactions
          (raw_message, status, error_message, telegram_message_id, telegram_chat_id)
         VALUES (?, 'parse_error', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           raw_message = VALUES(raw_message),
           error_message = VALUES(error_message)`,
        [rawText.substring(0, 65000), parsed.error?.substring(0, 490), messageId, chatId]
      );
      logger.warn('telegram', 'Failed to parse UPI message', { messageId, error: parsed.error, rawText });
      return;
    }

    const { amount, referenceNumber: parsedRef, payerName, txnTime, orderRef } = parsed.data;

    // BharatPe and some wallet apps don't include a UTR/Ref number.
    // Generate a synthetic one from message_id + chat_id so it's unique per message.
    const referenceNumber = parsedRef || `AUTO-${chatId}-${messageId}`;

    // If this message previously failed parsing (parse_error row), remove the stale row
    // so the new 'received' INSERT succeeds against the (telegram_message_id, telegram_chat_id) UNIQUE key.
    await pool.query(
      "DELETE FROM upi_webhook_transactions WHERE telegram_message_id = ? AND telegram_chat_id = ? AND status = 'parse_error'",
      [messageId, chatId]
    );

    // Store the parsed transaction (guard against duplicate reference_number)
    let insertResult;
    try {
      [insertResult] = await pool.query(
        `INSERT INTO upi_webhook_transactions
          (raw_message, amount, reference_number, payer_name, txn_time, status, telegram_message_id, telegram_chat_id)
         VALUES (?, ?, ?, ?, ?, 'received', ?, ?)`,
        [rawText.substring(0, 65000), amount, referenceNumber, payerName?.substring(0, 140), txnTime?.substring(0, 45), messageId, chatId]
      );
    } catch (insertErr) {
      // Duplicate reference — already processed, skip silently
      if (insertErr.code === 'ER_DUP_ENTRY') {
        logger.info('telegram', 'Skipping duplicate reference number', { referenceNumber, messageId });
        return;
      }
      throw insertErr;
    }

    const webhookTxnId = insertResult.insertId;

    // Emit real-time webhook received event
    eventBus.emit('webhook_transaction_received', {
      txnId: webhookTxnId,
      amount,
      referenceNumber,
      payerName,
      status: 'received',
    });

    // Attempt auto-matching (this is the core logic)
    try {
      const result = await matchAndCreditDeposit({
        amount,
        referenceNumber,
        payerName,
        txnTime,
        webhookTxnId,
        orderRef,
      });

      if (result.matched) {
        logger.info('auto-deposit', 'Payment matched and credited', {
          orderId: result.orderId,
          depositId: result.depositId,
          userId: result.userId,
          amount,
          referenceNumber,
          parsedOrderRef: orderRef,
          matchedOrderRef: result.matchedOrderRef || null,
        });

        // Emit real-time order matched event
        eventBus.emit('deposit_order_matched', {
          orderId: result.orderId,
          depositId: result.depositId,
          userId: result.userId,
          amount,
          utrNumber: referenceNumber,
          moderatorId: result.moderatorId,
        });
      } else {
        logger.warn('auto-deposit', 'Payment not matched', {
          webhookTxnId,
          amount,
          referenceNumber,
          orderRef,
          reason: result.reason,
        });
      }
    } catch (matchError) {
      logger.error('auto-deposit', 'Match error', {
        webhookTxnId,
        amount,
        referenceNumber,
        error: matchError.message,
      });
    }
  } catch (error) {
    logger.error('telegram', 'Webhook processing error', error);
  }
};

/**
 * GET /api/telegram/health
 * Health check for the Telegram integration
 */
exports.getHealth = async (req, res) => {
  try {
    const [recentTxns] = await pool.query(
      'SELECT COUNT(*) as count FROM upi_webhook_transactions WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
    );
    const [pendingOrders] = await pool.query(
      "SELECT COUNT(*) as count FROM pending_deposit_orders WHERE status = 'pending'"
    );
    const [parseErrors] = await pool.query(
      "SELECT COUNT(*) as count FROM upi_webhook_transactions WHERE status = 'parse_error' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );

    res.json({
      status: 'ok',
      telegram_bot_configured: !!process.env.TELEGRAM_BOT_TOKEN,
      recent_webhook_messages: recentTxns[0].count,
      recent_parse_errors: parseErrors[0].count,
      pending_deposit_orders: pendingOrders[0].count,
    });
  } catch (error) {
    logger.error('telegram', 'Health check failed', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
};
