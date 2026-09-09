const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const depositController = require('../controllers/deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Rate limiter for deposit order creation: max 20 per 10 minutes
const orderCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `deposit:${req.user?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many deposit requests. Please wait a few moments.' },
});

// ========== USER ROUTES ==========
// Create new deposit order to initiate Juspay checkout
router.post('/create-order', authenticate, orderCreateLimiter, depositController.createDepositOrder);

// Check order status / trigger server-side reconcile
router.get('/order-status/:orderId', authenticate, depositController.getOrderStatus);

// User's own deposit history
router.get('/my-deposits', authenticate, depositController.getMyDeposits);

// ========== WEBHOOK ROUTE ==========
// Webhook endpoint called by Juspay server
router.post('/webhook', depositController.handleWebhook);

// ========== ADMIN / MODERATOR ROUTES ==========
// List all deposits (moderators view their users only)
router.get('/all', authenticate, authorize('admin', 'moderator'), depositController.getAllDeposits);

module.exports = router;
