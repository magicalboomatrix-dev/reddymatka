const express = require('express');
const router = express.Router();
const moderatorController = require('../controllers/moderator.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.post('/', authenticate, authorize('admin'), moderatorController.createModerator);
router.get('/', authenticate, authorize('admin'), moderatorController.listModerators);
router.put('/:id', authenticate, authorize('admin'), moderatorController.updateModerator);
router.put('/:id/scanner', authenticate, authorize('admin', 'moderator'), moderatorController.updateScanner);
router.delete('/:id', authenticate, authorize('admin'), moderatorController.deleteModerator);
router.post('/assign-users', authenticate, authorize('admin'), moderatorController.assignUsers);

module.exports = router;
