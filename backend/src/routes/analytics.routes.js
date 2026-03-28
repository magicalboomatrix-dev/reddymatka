const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/dashboard', authenticate, authorize('admin', 'moderator'), analyticsController.getDashboard);
router.get('/bets', authenticate, authorize('admin', 'moderator'), analyticsController.getBetAnalytics);
router.get('/revenue', authenticate, authorize('admin'), analyticsController.getRevenueAnalytics);

module.exports = router;
