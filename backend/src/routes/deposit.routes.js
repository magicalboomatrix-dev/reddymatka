const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// User routes
router.get('/history', authenticate, depositController.getDepositHistory);

// Admin routes (read-only)
router.get('/all', authenticate, authorize('admin'), depositController.getAllDeposits);

module.exports = router;
