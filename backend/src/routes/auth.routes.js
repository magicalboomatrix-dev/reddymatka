const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/check-user', authController.checkUser);
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/complete-profile', authController.completeProfile);
router.post('/set-mpin', authenticate, authController.setMpin);
router.post('/reset-mpin', authController.resetMpin);
router.post('/login-mpin', authController.loginMpin);
router.post('/admin-login', authController.adminLogin);

module.exports = router;
