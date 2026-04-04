const express = require('express');
const router = express.Router();
const resultController = require('../controllers/result.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const importUpload = require('../middleware/result-import.middleware');
const { cache } = require('../middleware/cache.middleware');
const { adminActivity } = require('../middleware/admin-activity.middleware');

router.get('/monthly', cache(120), resultController.getMonthlyResults);
router.get('/yearly', cache(300), resultController.getYearlyResults);
router.get('/live', cache(30), resultController.getLiveResults);
router.get('/admin/monthly', authenticate, authorize('admin'), resultController.getAdminMonthlyResults);
router.get('/admin/yearly', authenticate, authorize('admin'), resultController.getAdminYearlyResults);
router.get('/template/yearly', authenticate, authorize('admin'), resultController.downloadYearlyTemplate);
router.get('/history', authenticate, authorize('admin'), resultController.getResultHistory);
router.post('/manage', authenticate, authorize('admin'), adminActivity('result_declared', 'game_result'), resultController.upsertResult);
router.put('/:id', authenticate, authorize('admin'), adminActivity('result_updated', 'game_result'), resultController.updateResultById);
router.delete('/:id', authenticate, authorize('admin'), adminActivity('result_deleted', 'game_result'), resultController.deleteResultById);
router.post('/bulk-delete', authenticate, authorize('admin'), resultController.bulkDeleteResults);
router.post('/import/yearly', authenticate, authorize('admin'), importUpload.single('file'), resultController.importYearlyResults);

module.exports = router;
