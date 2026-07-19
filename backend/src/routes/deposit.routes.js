const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Admin / Moderator routes (read-only, moderators see only their users' deposits)
router.get('/all', authenticate, authorize('admin', 'moderator'), depositController.getAllDeposits);

module.exports = router;
