const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const telegramController = require('../controllers/telegram.controller');

// Telegram's known IP ranges (https://core.telegram.org/bots/webhooks#the-short-version)
const TELEGRAM_IP_RANGES = [
  // 149.154.160.0/20
  { start: (149 << 24) + (154 << 16) + (160 << 8), mask: 0xFFFFF000 },
  // 91.108.4.0/22
  { start: (91 << 24) + (108 << 16) + (4 << 8), mask: 0xFFFFFC00 },
];

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return 0;
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isTelegramIp(ip) {
  if (!ip) return false;
  // In development/tunnel mode, skip IP check
  if (process.env.NODE_ENV !== 'production') return true;
  const cleaned = ip.replace('::ffff:', '');
  const ipInt = ipToInt(cleaned);
  if (ipInt === 0) return false;
  return TELEGRAM_IP_RANGES.some(range => (ipInt & range.mask) === (range.start >>> 0));
}

// Rate limit: max 120 requests per minute for the webhook endpoint
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests' },
});

/**
 * Telegram webhook endpoint.
 * The :token path param must match TELEGRAM_WEBHOOK_SECRET to prevent unauthorized access.
 */
router.post('/webhook/:token', webhookLimiter, (req, res, next) => {
  const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedToken || req.params.token !== expectedToken) {
    return res.sendStatus(403);
  }
  // IP whitelist check
  if (!isTelegramIp(req.ip)) {
    return res.sendStatus(403);
  }
  telegramController.handleWebhook(req, res, next);
});

// Health check (admin only, authenticated via separate admin routes)
router.get('/health', telegramController.getHealth);

module.exports = router;
