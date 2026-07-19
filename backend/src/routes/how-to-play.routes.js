const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const videoUpload = require('../middleware/video-upload.middleware');
const {
  getVideos,
  getAdminVideos,
  createVideo,
  updateVideo,
  toggleVideo,
  deleteVideo,
} = require('../controllers/how-to-play.controller');

// Public (user-facing)
router.get('/', getVideos);

// Admin only
router.get('/admin/all', authenticate, authorize('admin'), getAdminVideos);
router.post('/admin', authenticate, authorize('admin'), videoUpload.single('video'), createVideo);
router.put('/admin/:id', authenticate, authorize('admin'), videoUpload.single('video'), updateVideo);
router.patch('/admin/:id/toggle', authenticate, authorize('admin'), toggleVideo);
router.delete('/admin/:id', authenticate, authorize('admin'), deleteVideo);

module.exports = router;
