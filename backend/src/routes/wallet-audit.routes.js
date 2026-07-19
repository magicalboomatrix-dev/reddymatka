'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wallet-audit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/transactions',     authenticate, authorize('admin'), ctrl.getWalletTransactions);
router.get('/bonus-transactions', authenticate, authorize('admin'), ctrl.getBonusTransactions);
router.get('/user/:userId',     authenticate, authorize('admin'), ctrl.getUserLedger);
router.get('/reconciliation',   authenticate, authorize('admin'), ctrl.getReconciliationSummary);

module.exports = router;
