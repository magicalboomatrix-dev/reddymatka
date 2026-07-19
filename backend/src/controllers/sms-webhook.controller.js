/**
 * SMS Webhook Controller
 * Receives forwarded UPI bank SMS messages directly from a mobile SMS forwarder app
 * and triggers auto-deposit matching, bypassing Telegram.
 */

const pool = require('../config/database');
const { parseUpiMessage } = require('../services/upi-message-parser');
const { matchAndCreditDeposit } = require('../services/auto-deposit-matcher');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

/**
 * POST /api/sms/webhook/:token
 * SMS Forwarder app sends SMS content here.
 */
exports.handleWebhook = async (req, res) => {
  // Verify token
  const token = req.params.token;
  const expectedToken = process.env.SMS_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedToken || token !== expectedToken) {
    logger.warn('sms-webhook', 'Webhook rejected: invalid token', { ip: req.ip });
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  try {
    const payload = req.body;
    if (!payload || Object.keys(payload).length === 0) {
      logger.warn('sms-webhook', 'Empty payload received');
      return res.status(400).json({ error: 'Bad Request: Empty payload' });
    }

    // Extract text from the common JSON keys used by SMS forwarder apps
    const rawText = payload.text || payload.message || payload.body || payload.content || payload.msg;
    if (!rawText || typeof rawText !== 'string') {
      logger.warn('sms-webhook', 'No text content found in payload', { payload });
      return res.status(400).json({ error: 'Bad Request: Missing SMS text/message field' });
    }

    // Extract sender/from (for logs and synthetic ID)
    const sender = String(payload.from || payload.sender || payload.phone || 'SMS').trim();

    // Extract an ID for idempotency/uniqueness checks. Fallback to timestamp or random if missing.
    const rawId = payload.id || payload.message_id || payload.msg_id || payload.timestamp;
    const msgUniqueId = rawId ? String(rawId).trim() : `gen_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Map to synthetic Telegram columns so we reuse the database structure & dashboard UI
    const chatId = 'sms_forwarder';
    const messageId = `sms_${sender.replace(/[^a-zA-Z0-9]/g, '')}_${msgUniqueId}`;

    logger.info('sms-webhook', 'Received SMS payload', {
      sender,
      msgUniqueId,
      messageId,
      preview: rawText.substring(0, 80),
    });

    // Check if this message was already processed (idempotency)
    const [existing] = await pool.query(
      `SELECT id, status FROM upi_webhook_transactions
       WHERE telegram_message_id = ? AND telegram_chat_id = ? AND status != 'parse_error' LIMIT 1`,
      [messageId, chatId]
    );

    if (existing.length > 0) {
      logger.info('sms-webhook', 'SMS already processed, skipping duplicate request', { messageId });
      return res.status(200).json({ status: 'duplicate', message: 'Already processed', txnId: existing[0].id });
    }

    // Parse the UPI SMS content
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
      logger.warn('sms-webhook', 'Failed to parse UPI SMS', { messageId, error: parsed.error, rawText });
      return res.status(200).json({ status: 'parse_error', error: parsed.error });
    }

    const { amount, referenceNumber: parsedRef, payerName, txnTime, orderRef } = parsed.data;

    // Generate a synthetic UTR/Ref if the bank SMS doesn't include one (e.g. BharatPe notifications)
    const referenceNumber = parsedRef || `AUTO-SMS-${msgUniqueId}`;

    // Remove stale parse_error row if it previously failed
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
      if (insertErr.code === 'ER_DUP_ENTRY') {
        logger.info('sms-webhook', 'Skipping duplicate reference number', { referenceNumber, messageId });
        return res.status(200).json({ status: 'duplicate', message: 'UTR already exists', referenceNumber });
      }
      throw insertErr;
    }

    const webhookTxnId = insertResult.insertId;

    // Emit real-time webhook received event (notifies admin dashboard)
    eventBus.emit('webhook_transaction_received', {
      txnId: webhookTxnId,
      amount,
      referenceNumber,
      payerName,
      status: 'received',
    });

    // Attempt auto-matching
    let matchResult = { matched: false, reason: 'no_match' };
    try {
      const result = await matchAndCreditDeposit({
        amount,
        referenceNumber,
        payerName,
        txnTime,
        webhookTxnId,
        orderRef,
      });

      matchResult = result;

      if (result.matched) {
        logger.info('sms-webhook', 'Payment matched and credited', {
          orderId: result.orderId,
          depositId: result.depositId,
          userId: result.userId,
          amount,
          referenceNumber,
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
        logger.warn('sms-webhook', 'Payment not matched', {
          webhookTxnId,
          amount,
          referenceNumber,
          reason: result.reason,
        });
      }
    } catch (matchError) {
      logger.error('sms-webhook', 'Match execution error', {
        webhookTxnId,
        amount,
        referenceNumber,
        error: matchError.message,
      });
    }

    return res.status(200).json({
      status: 'success',
      parsed: {
        amount,
        referenceNumber,
        payerName,
        orderRef,
      },
      matchResult: {
        matched: matchResult.matched,
        reason: matchResult.matched ? undefined : matchResult.reason,
        orderId: matchResult.orderId || null,
        depositId: matchResult.depositId || null,
      },
    });

  } catch (error) {
    logger.error('sms-webhook', 'Webhook processing error', error);
    return res.status(500).json({ error: 'Internal server error processing webhook' });
  }
};
