const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const withdrawController = require('../controllers/withdraw.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { adminActivity } = require('../middleware/admin-activity.middleware');

// Rate limit: max 5 withdrawal requests per 15 minutes per user
const withdrawLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many withdrawal requests. Please wait.' },
});

// User routes
router.post('/request', authenticate, withdrawLimiter, withdrawController.requestWithdraw);
router.get('/history', authenticate, withdrawController.getWithdrawHistory);

// Admin/Moderator routes
router.get('/all', authenticate, authorize('admin', 'moderator'), withdrawController.getAllWithdrawals);
router.put('/:id/approve', authenticate, authorize('admin', 'moderator'), adminActivity('approve_withdrawal', 'withdraw_request'), withdrawController.approveWithdraw);
router.put('/:id/reject',  authenticate, authorize('admin', 'moderator'), adminActivity('reject_withdrawal',  'withdraw_request'), withdrawController.rejectWithdraw);

module.exports = router;
