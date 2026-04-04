const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { cache } = require('../middleware/cache.middleware');

router.get('/dashboard', authenticate, authorize('admin', 'moderator'), cache(30), analyticsController.getDashboard);
router.get('/bets',      authenticate, authorize('admin', 'moderator'), cache(60), analyticsController.getBetAnalytics);
router.get('/revenue',   authenticate, authorize('admin'),               cache(120), analyticsController.getRevenueAnalytics);
router.get('/games',     authenticate, authorize('admin', 'moderator'), cache(120), analyticsController.getGameAnalytics);
router.get('/bet-types', authenticate, authorize('admin', 'moderator'), cache(60),  analyticsController.getBetTypeAnalytics);

module.exports = router;
