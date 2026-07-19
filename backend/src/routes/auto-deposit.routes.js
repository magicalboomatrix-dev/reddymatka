const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const autoDepositController = require('../controllers/auto-deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Rate limit: max 10 order creations per 15 minutes per user (keyed by user ID)
const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `user:${req.user?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many deposit order requests. Please wait 15 minutes before creating another.' },
});

// ========== USER ROUTES ==========

router.get('/qr/:token', autoDepositController.openProtectedQr);

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

// Clear webhook transactions older than 24 hours
router.delete('/admin/webhook-transactions/older-than-24h', authenticate, authorize('admin'), autoDepositController.clearOldWebhookTransactions);

// View pending deposit orders
router.get('/admin/pending-orders', authenticate, authorize('admin'), autoDepositController.getPendingOrders);

// Clear cancelled/expired deposit orders older than 24 hours
router.delete('/admin/closed-orders/older-than-24h', authenticate, authorize('admin'), autoDepositController.clearOldClosedOrders);

// View audit logs
router.get('/admin/logs', authenticate, authorize('admin'), autoDepositController.getAutoDepositLogs);

// Clear audit logs older than 24 hours
router.delete('/admin/logs/older-than-24h', authenticate, authorize('admin'), autoDepositController.clearOldAutoDepositLogs);

// Dashboard stats
router.get('/admin/stats', authenticate, authorize('admin'), autoDepositController.getStats);

// Manual order expiry trigger
router.post('/admin/expire-orders', authenticate, authorize('admin'), autoDepositController.triggerExpireOrders);

// Admin cancel a pending order
router.post('/admin/orders/:id/cancel', authenticate, authorize('admin'), autoDepositController.adminCancelOrder);

// Admin manually credit a pending order (when auto-match failed)
router.post('/admin/orders/:id/credit', authenticate, authorize('admin'), autoDepositController.adminCreditOrder);

// Search webhook transactions by UTR
router.get('/admin/search-utr/:utr', authenticate, authorize('admin'), autoDepositController.searchByUtr);

// Credit a user's wallet from an unmatched webhook transaction
router.post('/admin/credit-by-utr', authenticate, authorize('admin'), autoDepositController.creditByUtr);

// List unmatched/received webhook transactions
router.get('/admin/unmatched-transactions', authenticate, authorize('admin'), autoDepositController.getUnmatchedTransactions);

// Match all today's unmatched transactions
router.post('/admin/match-today-unmatched', authenticate, authorize('admin'), autoDepositController.matchTodayUnmatched);

// ========== MODERATOR ROUTES (filtered to their users only) ==========

// Moderator views pending orders for their users only
router.get('/moderator/pending-orders', authenticate, authorize('moderator'), autoDepositController.getModeratorPendingOrders);

// Moderator cancels an order for their user
router.post('/moderator/orders/:id/cancel', authenticate, authorize('moderator'), autoDepositController.moderatorCancelOrder);

// Moderator manually credits an order for their user
router.post('/moderator/orders/:id/credit', authenticate, authorize('moderator'), autoDepositController.moderatorCreditOrder);

// Moderator dashboard stats for their users only
router.get('/moderator/stats', authenticate, authorize('moderator'), autoDepositController.getModeratorStats);

// Moderator views webhook transactions matched to their users
router.get('/moderator/webhook-transactions', authenticate, authorize('moderator'), autoDepositController.getModeratorWebhookTransactions);

// Moderator search UTR (limited to their users' deposits)
router.get('/moderator/search-utr/:utr', authenticate, authorize('moderator'), autoDepositController.moderatorSearchByUtr);

module.exports = router;
