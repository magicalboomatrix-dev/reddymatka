const express = require('express');
const router = express.Router();
const resultController = require('../controllers/result.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const importUpload = require('../middleware/result-import.middleware');

router.get('/monthly', resultController.getMonthlyResults);
router.get('/yearly', resultController.getYearlyResults);
router.get('/live', resultController.getLiveResults);
router.get('/admin/monthly', authenticate, authorize('admin'), resultController.getAdminMonthlyResults);
router.get('/admin/yearly', authenticate, authorize('admin'), resultController.getAdminYearlyResults);
router.get('/template/yearly', authenticate, authorize('admin'), resultController.downloadYearlyTemplate);
router.get('/history', authenticate, authorize('admin'), resultController.getResultHistory);
router.post('/manage', authenticate, authorize('admin'), resultController.upsertResult);
router.put('/:id', authenticate, authorize('admin'), resultController.updateResultById);
router.delete('/:id', authenticate, authorize('admin'), resultController.deleteResultById);
router.post('/bulk-delete', authenticate, authorize('admin'), resultController.bulkDeleteResults);
router.post('/import/yearly', authenticate, authorize('admin'), importUpload.single('file'), resultController.importYearlyResults);

module.exports = router;
