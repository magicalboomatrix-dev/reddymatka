const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Admin routes (read-only)
router.get('/all', authenticate, authorize('admin'), depositController.getAllDeposits);

module.exports = router;
