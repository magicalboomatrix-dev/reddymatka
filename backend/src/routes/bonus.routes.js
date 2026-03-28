const express = require('express');
const router = express.Router();
const bonusController = require('../controllers/bonus.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/history', authenticate, bonusController.getBonusHistory);
router.get('/referrals', authenticate, bonusController.getReferrals);
router.get('/rules', bonusController.getBonusRules);

module.exports = router;
