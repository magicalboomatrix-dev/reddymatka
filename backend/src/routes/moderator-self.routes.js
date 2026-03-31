const express = require('express');
const router = express.Router();
const moderatorController = require('../controllers/moderator.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/scanner', authenticate, authorize('moderator'), moderatorController.getOwnScanner);
router.put('/scanner', authenticate, authorize('moderator'), moderatorController.updateOwnScanner);

module.exports = router;