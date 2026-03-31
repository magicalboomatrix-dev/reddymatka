const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const autoDepositController = require('../controllers/auto-deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Rate limit: max 10 order creations per 15 minutes per user
const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many deposit order requests. Please wait.' },
});

// ========== USER ROUTES ==========

// Create a deposit order (user provides amount, gets UPI details)
router.post('/order', authenticate, orderCreateLimiter, autoDepositController.createDepositOrder);

// Get status of a specific order
router.get('/order/status/:id', authenticate, autoDepositController.getOrderStatus);

// Get user's deposit order history
router.get('/orders', authenticate, autoDepositController.getMyOrders);

// Cancel a pending order
router.post('/order/:id/cancel', authenticate, autoDepositController.cancelOrder);

// ========== ADMIN ROUTES ==========

// View webhook transactions (UPI messages from Telegram)
router.get('/admin/webhook-transactions', authenticate, authorize('admin'), autoDepositController.getWebhookTransactions);

// View pending deposit orders
router.get('/admin/pending-orders', authenticate, authorize('admin'), autoDepositController.getPendingOrders);

// View audit logs
router.get('/admin/logs', authenticate, authorize('admin'), autoDepositController.getAutoDepositLogs);

// Dashboard stats
router.get('/admin/stats', authenticate, authorize('admin'), autoDepositController.getStats);

// Manual order expiry trigger
router.post('/admin/expire-orders', authenticate, authorize('admin'), autoDepositController.triggerExpireOrders);

module.exports = router;
