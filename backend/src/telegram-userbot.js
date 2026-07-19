'use strict';
/**
 * Telegram Userbot Listener
 *
 * WHY THIS EXISTS:
 *   Telegram's Bot API does not deliver messages sent by other bots to your bot.
 *   If the SMS forwarder in the payment group is itself a bot, your webhook bot
 *   never receives those messages and deposits cannot be auto-verified.
 *
 *   A "userbot" connects to Telegram as a REAL USER ACCOUNT (via the MTProto API)
 *   and CAN see ALL messages in a group, including those from other bots.
 *   When it sees a new message it POSTs it to the local webhook endpoint so the
 *   existing controller handles parsing, dedup, matching and crediting — no logic
 *   is duplicated here.
 *
 * SETUP (one-time):
 *   1. Get API credentials from https://my.telegram.org → "API development tools"
 *      Add to .env:
 *        TELEGRAM_API_ID=<your api_id>
 *        TELEGRAM_API_HASH=<your api_hash>
 *
 *   2. Generate a session string (run once, copy output to .env):
 *        node src/scripts/gen-telegram-session.js
 *      Add to .env:
 *        TELEGRAM_SESSION=<long session string>
 *
 *   3. Start this process (PM2 recommended):
 *        node src/telegram-userbot.js
 *      Or with PM2:
 *        pm2 start src/telegram-userbot.js --name reddymatka-userbot
 *
 * ENV VARS REQUIRED:
 *   TELEGRAM_API_ID          - integer app id from my.telegram.org
 *   TELEGRAM_API_HASH        - string api hash from my.telegram.org
 *   TELEGRAM_SESSION         - session string from gen-telegram-session.js
 *   TELEGRAM_CHAT_ID         - the group/chat id to listen to (e.g. -5184245627)
 *   TELEGRAM_WEBHOOK_SECRET  - matches :token in webhook route
 *   BACKEND_PUBLIC_URL       - production base URL (e.g. https://api.reddymatka.com)
 */

require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';

const { TelegramClient } = require('telegram');
const { NewMessage } = require('telegram/events');
const { StringSession } = require('telegram/sessions');
const https = require('https');
const logger = require('./utils/logger');

const REQUIRED_VARS = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION',
  'TELEGRAM_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET', 'BACKEND_PUBLIC_URL'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`[userbot] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION_STRING = process.env.TELEGRAM_SESSION;
const ALLOWED_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID);
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BACKEND_BASE_URL = process.env.BACKEND_PUBLIC_URL.replace(/\/$/, ''); // e.g. https://api.reddymatka.com

// Synthetic message ids are prefixed to avoid collisions with real bot webhook message_ids.
// Real Telegram message ids are always positive integers; we keep them as-is.
function makeSyntheticMessageId(chatId, msgId) {
  return `ub_${chatId}_${msgId}`;
}

/**
 * POST the message text to the production webhook endpoint, reusing all existing
 * controller logic (parsing, idempotency, matching, crediting, logging).
 */
function postToWebhook(chatId, messageId, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      message: {
        message_id: makeSyntheticMessageId(chatId, messageId),
        chat: { id: parseInt(chatId, 10) || chatId },
        text,
      },
    });

    const url = new URL(`${BACKEND_BASE_URL}/api/telegram/webhook/${WEBHOOK_SECRET}`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      // Drain the response body
      res.resume();
      resolve(res.statusCode);
    });

    req.on('error', (err) => {
      logger.error('userbot', 'Failed to POST to webhook', { error: err.message });
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

async function startUserbot() {
  logger.info('userbot', 'Starting Telegram userbot listener');

  const client = new TelegramClient(
    new StringSession(SESSION_STRING),
    API_ID,
    API_HASH,
    {
      connectionRetries: 5,
      retryDelay: 2000,
      autoReconnect: true,
      baseLogger: {
        // Suppress gramjs internal logs unless debug mode
        debug: () => { },
        info: () => { },
        warn: (msg) => logger.warn('userbot/gramjs', msg),
        error: (msg) => logger.error('userbot/gramjs', msg),
      },
    }
  );

  await client.connect();
  logger.info('userbot', 'Connected to Telegram as userbot');

  // Listen to ALL new messages
  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;

      // Only process messages from the configured payment group/chat
      const chatId = String(msg.chatId || msg.peerId?.channelId || msg.peerId?.chatId || '');
      // Telegram delivers channel/group chat ids without the leading minus in MTProto
      const normalizedChatId = chatId.startsWith('-') ? chatId : `-${chatId}`;
      if (normalizedChatId !== ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID.replace('-', '')) {
        return;
      }

      const rawText = msg.text || msg.message;
      if (!rawText || !rawText.trim()) return;

      const messageId = String(msg.id);
      logger.info('userbot', 'Received message, forwarding to webhook', {
        chatId,
        messageId,
        preview: rawText.substring(0, 80),
      });

      const statusCode = await postToWebhook(ALLOWED_CHAT_ID, messageId, rawText);
      logger.info('userbot', 'Webhook POST result', { messageId, statusCode });
    } catch (err) {
      logger.error('userbot', 'Error handling message event', { error: err.message });
    }
  }, new NewMessage({}));

  logger.info('userbot', `Listening for messages in chat ${ALLOWED_CHAT_ID}`);

  // Graceful shutdown
  async function shutdown(signal) {
    logger.info('userbot', `Received ${signal} — disconnecting`);
    try { await client.disconnect(); } catch (_) { }
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startUserbot().catch((err) => {
  logger.error('userbot', 'Failed to start userbot', { error: err.message, stack: err.stack });
  process.exit(1);
});
