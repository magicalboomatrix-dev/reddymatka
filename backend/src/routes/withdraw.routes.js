const express = require('express');
const router = express.Router();
const withdrawController = require('../controllers/withdraw.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// User routes
router.post('/request', authenticate, withdrawController.requestWithdraw);
router.get('/history', authenticate, withdrawController.getWithdrawHistory);

// Admin/Moderator routes
router.get('/all', authenticate, authorize('admin', 'moderator'), withdrawController.getAllWithdrawals);
router.put('/:id/approve', authenticate, authorize('admin', 'moderator'), withdrawController.approveWithdraw);
router.put('/:id/reject', authenticate, authorize('admin', 'moderator'), withdrawController.rejectWithdraw);

module.exports = router;
