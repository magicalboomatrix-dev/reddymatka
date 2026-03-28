const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/recent', notificationController.getRecentNotifications);
router.get('/my', authenticate, notificationController.getUserNotifications);
router.put('/:id/read', authenticate, notificationController.markRead);

module.exports = router;
