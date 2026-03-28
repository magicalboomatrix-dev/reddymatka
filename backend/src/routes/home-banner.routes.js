const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const adUpload = require('../middleware/ad-upload.middleware');
const {
  getCustomAds,
  getAllCustomAds,
  createCustomAd,
  updateCustomAd,
  deleteCustomAd,
  toggleCustomAd,
} = require('../controllers/home-banner.controller');

// Public
router.get('/', getCustomAds);

// Admin
router.get('/all', authenticate, authorize('admin'), getAllCustomAds);
router.post('/', authenticate, authorize('admin'), adUpload.single('image'), createCustomAd);
router.put('/:id', authenticate, authorize('admin'), adUpload.single('image'), updateCustomAd);
router.delete('/:id', authenticate, authorize('admin'), deleteCustomAd);
router.patch('/:id/toggle', authenticate, authorize('admin'), toggleCustomAd);

module.exports = router;
