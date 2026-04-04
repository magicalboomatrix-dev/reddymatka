const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// 5 OTP verification attempts per phone number per minute.
// Keyed on the normalised phone from the request body (falls back to IP).
const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
    return phone || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP attempts. Please wait a moment and try again.' },
});

router.post('/check-user', authController.checkUser);
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', otpVerifyLimiter, authController.verifyOTP);
router.post('/complete-profile', authController.completeProfile);
router.post('/set-mpin', authenticate, authController.setMpin);
router.post('/reset-mpin', authController.resetMpin);
router.post('/login-mpin', authController.loginMpin);
router.post('/admin-login', authController.adminLogin);
router.post('/logout', authController.logout);

module.exports = router;
