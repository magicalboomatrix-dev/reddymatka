const express = require('express');
const router = express.Router();
const betController = require('../controllers/bet.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/place', authenticate, betController.placeBet);
router.get('/my-bets', authenticate, betController.getUserBets);
router.get('/history', authenticate, betController.getUserBets);
router.get('/recent-winners', authenticate, betController.getRecentWinners);

module.exports = router;
