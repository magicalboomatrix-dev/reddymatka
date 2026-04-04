const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { adminActivity } = require('../middleware/admin-activity.middleware');

router.get('/users', authenticate, authorize('admin', 'moderator'), adminController.listUsers);
router.put('/users/:id/block', authenticate, authorize('admin'), adminActivity('block_user', 'user'), adminController.blockUser);
router.get('/settings', authenticate, authorize('admin'), adminController.getSettings);
router.put('/settings', authenticate, authorize('admin'), adminActivity('update_settings', 'settings'), adminController.updateSettings);
router.get('/flagged-accounts', authenticate, authorize('admin'), adminController.getFlaggedAccounts);
router.get('/moderator-stats', authenticate, authorize('admin'), adminController.getModeratorStats);
router.get('/moderator-stats/:id/transactions', authenticate, authorize('admin'), adminController.getModeratorTransactions);
router.get('/moderators/:id/detail', authenticate, authorize('admin'), adminController.getModeratorDetail);
router.get('/users/:id/detail', authenticate, authorize('admin'), adminController.getUserDetail);
router.get('/fraud-logs', authenticate, authorize('admin'), adminController.getFraudLogs);
router.get('/fraud-alerts', authenticate, authorize('admin'), adminController.getFraudAlerts);
router.get('/dashboard-stats', authenticate, authorize('admin'), adminController.getDashboardStats);
router.get('/payout-rates', authenticate, authorize('admin'), adminController.getPayoutRates);
router.put('/payout-rates', authenticate, authorize('admin'), adminActivity('update_payout_rates', 'settings'), adminController.updatePayoutRates);
router.get('/bonus-rates', authenticate, authorize('admin'), adminController.getBonusRates);
router.put('/bonus-rates', authenticate, authorize('admin'), adminActivity('update_bonus_rates', 'settings'), adminController.updateBonusRates);
router.get('/upi-management', authenticate, authorize('admin'), adminController.getUpiManagement);
router.put('/upi-management/admin-upi', authenticate, authorize('admin'), adminActivity('update_admin_upi', 'settings'), adminController.updateAdminUpi);

module.exports = router;
