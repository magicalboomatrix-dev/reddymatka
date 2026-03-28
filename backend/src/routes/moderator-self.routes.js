const express = require('express');
const router = express.Router();
const moderatorController = require('../controllers/moderator.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const scannerUpload = require('../middleware/scanner-upload.middleware');

router.get('/scanner', authenticate, authorize('moderator'), moderatorController.getOwnScanner);
router.put('/scanner', authenticate, authorize('moderator'), scannerUpload.single('qr_code_image'), moderatorController.updateOwnScanner);

module.exports = router;