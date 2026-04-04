'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settlement-monitor.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/queue',  authenticate, authorize('admin', 'moderator'), ctrl.getQueue);
router.get('/stats',  authenticate, authorize('admin', 'moderator'), ctrl.getStats);
router.post('/retry/:id', authenticate, authorize('admin'), ctrl.retryFailed);

module.exports = router;
