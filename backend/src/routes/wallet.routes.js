const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/info', authenticate, walletController.getWalletInfo);

module.exports = router;
