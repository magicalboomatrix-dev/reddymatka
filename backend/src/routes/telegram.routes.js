const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const telegramController = require('../controllers/telegram.controller');

// Telegram's known IP ranges (https://core.telegram.org/bots/webhooks#the-short-version)
// All subnets Telegram may send webhook requests from
const TELEGRAM_IP_RANGES = [
  // 149.154.160.0/20
  { start: (149 << 24) + (154 << 16) + (160 << 8), mask: 0xFFFFF000 },
  // 91.108.4.0/22
  { start: (91 << 24) + (108 << 16) + (4 << 8), mask: 0xFFFFFC00 },
  // 91.108.8.0/22
  { start: (91 << 24) + (108 << 16) + (8 << 8), mask: 0xFFFFFC00 },
  // 91.108.12.0/22
  { start: (91 << 24) + (108 << 16) + (12 << 8), mask: 0xFFFFFC00 },
  // 91.108.16.0/22
  { start: (91 << 24) + (108 << 16) + (16 << 8), mask: 0xFFFFFC00 },
  // 91.108.20.0/22
  { start: (91 << 24) + (108 << 16) + (20 << 8), mask: 0xFFFFFC00 },
  // 91.108.56.0/22
  { start: (91 << 24) + (108 << 16) + (56 << 8), mask: 0xFFFFFC00 },
];

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return 0;
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isTelegramIp(req) {
  // In development/tunnel mode, skip IP check
  if (process.env.NODE_ENV !== 'production') return true;
  // If explicitly disabled (e.g. behind Cloudflare), skip IP check
  if (process.env.TELEGRAM_SKIP_IP_CHECK === 'true') return true;

  // Collect all candidate IPs: req.ip, X-Forwarded-For, CF-Connecting-IP
  const candidates = new Set();
  if (req.ip) candidates.add(req.ip.replace('::ffff:', ''));
  const xff = req.headers['x-forwarded-for'];
  if (xff) xff.split(',').forEach(ip => candidates.add(ip.trim().replace('::ffff:', '')));
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) candidates.add(cfIp.trim().replace('::ffff:', ''));

  for (const ip of candidates) {
    const ipInt = ipToInt(ip);
    if (ipInt === 0) continue;
    if (TELEGRAM_IP_RANGES.some(range => (ipInt & range.mask) === (range.start >>> 0))) {
      return true;
    }
  }
  return false;
}

const logger = require('../utils/logger');

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
    logger.warn('telegram', 'Webhook rejected: invalid token', { ip: req.ip });
    return res.sendStatus(403);
  }
  // IP whitelist check
  if (!isTelegramIp(req)) {
    logger.warn('telegram', 'Webhook rejected: IP not in Telegram ranges', {
      ip: req.ip,
      xff: req.headers['x-forwarded-for'] || null,
      cfIp: req.headers['cf-connecting-ip'] || null,
    });
    return res.sendStatus(403);
  }
  telegramController.handleWebhook(req, res, next);
});

// Health check (admin only, authenticated via separate admin routes)
router.get('/health', telegramController.getHealth);

module.exports = router;
