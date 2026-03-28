const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// User routes
router.get('/scanner', authenticate, depositController.getDepositScanner);
router.post('/request', authenticate, upload.single('screenshot'), depositController.requestDeposit);
router.get('/history', authenticate, depositController.getDepositHistory);

// Admin/Moderator routes
router.get('/all', authenticate, authorize('admin', 'moderator'), depositController.getAllDeposits);
router.put('/:id/approve', authenticate, authorize('admin', 'moderator'), depositController.approveDeposit);
router.put('/:id/reject', authenticate, authorize('admin', 'moderator'), depositController.rejectDeposit);

module.exports = router;
