const express = require('express');
const router = express.Router();
const moderatorController = require('../controllers/moderator.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const scannerUpload = require('../middleware/scanner-upload.middleware');

router.post('/', authenticate, authorize('admin'), moderatorController.createModerator);
router.get('/', authenticate, authorize('admin'), moderatorController.listModerators);
router.put('/:id', authenticate, authorize('admin'), moderatorController.updateModerator);
router.put('/:id/scanner', authenticate, authorize('admin', 'moderator'), scannerUpload.single('qr_code_image'), moderatorController.updateScanner);
router.put('/:id/float', authenticate, authorize('admin'), moderatorController.adjustModeratorFloat);
router.delete('/:id', authenticate, authorize('admin'), moderatorController.deleteModerator);
router.post('/assign-users', authenticate, authorize('admin'), moderatorController.assignUsers);

module.exports = router;
