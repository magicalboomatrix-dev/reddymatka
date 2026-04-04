'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wallet-audit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/user/:userId',     authenticate, authorize('admin'), ctrl.getUserLedger);
router.get('/reconciliation',   authenticate, authorize('admin'), ctrl.getReconciliationSummary);

module.exports = router;
