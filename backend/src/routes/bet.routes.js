const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const betController = require('../controllers/bet.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Rate limit: max 30 bet placements per minute per user
const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bet requests. Please slow down.' },
});

router.post('/place', authenticate, betLimiter, betController.placeBet);
router.get('/my-bets', authenticate, betController.getUserBets);
router.get('/history', authenticate, betController.getUserBets);
router.get('/recent-winners', authenticate, betController.getRecentWinners);

module.exports = router;
