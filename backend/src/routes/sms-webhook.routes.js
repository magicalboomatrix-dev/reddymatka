const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const smsWebhookController = require('../controllers/sms-webhook.controller');

// Rate limit: max 200 requests per minute for SMS webhook endpoints
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests' },
});

/**
 * Route: POST /api/sms/webhook/:token
 * Token matches SMS_WEBHOOK_SECRET or TELEGRAM_WEBHOOK_SECRET.
 */
router.post('/webhook/:token', webhookLimiter, smsWebhookController.handleWebhook);

module.exports = router;
