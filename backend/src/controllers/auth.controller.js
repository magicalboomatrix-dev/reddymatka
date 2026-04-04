const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOtpSms } = require('../utils/sms');
const { getPhoneCandidates, toE164Phone } = require('../utils/phone');
const { IST_NOW_SQL } = require('../utils/sql-time');

const MAX_MPIN_ATTEMPTS = 5;
const MPIN_BLOCK_MINUTES = 30;
const MAX_ADMIN_LOGIN_ATTEMPTS = 5;
const ADMIN_LOGIN_BLOCK_MINUTES = 30;

// Set an HttpOnly auth cookie on the response (avoids XSS token theft)
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

function generateReferralCode() {
  return 'REDDYMATKA' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check if a user exists and whether MPIN is set
exports.checkUser = async (req, res, next) => {
  try {
    const phoneCandidates = getPhoneCandidates(req.body.phone);
    if (phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }

    const [users] = await pool.query(
      'SELECT id, mpin_enabled, is_blocked FROM users WHERE phone IN (?) AND role = ? LIMIT 1',
      [phoneCandidates, 'user']
    );

    if (users.length === 0) {
      return res.json({ exists: false, mpinSet: false });
    }

    if (users[0].is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
    }

    return res.json({ exists: true, mpinSet: !!users[0].mpin_enabled });
  } catch (error) {
    next(error);
  }
};

// Send OTP — only for new registration or MPIN reset
exports.sendOTP = async (req, res, next) => {
  try {
    const phoneCandidates = getPhoneCandidates(req.body.phone);
    const e164Phone = toE164Phone(req.body.phone);
    const { purpose } = req.body;
    if (phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }

    // Validate purpose
    if (!['register', 'reset_mpin'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose.' });
    }

    // For registration, ensure user doesn't already exist
    if (purpose === 'register') {
      const [existing] = await pool.query('SELECT id FROM users WHERE phone IN (?) LIMIT 1', [phoneCandidates]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User already exists. Please login with MPIN.' });
      }
    }

    // For reset_mpin, ensure user exists
    let otpPhone = e164Phone || phoneCandidates[0];
    if (purpose === 'reset_mpin') {
      const [existing] = await pool.query('SELECT id, phone, is_blocked FROM users WHERE phone IN (?) LIMIT 1', [phoneCandidates]);
      if (existing.length === 0) {
        return res.status(400).json({ error: 'User not found.' });
      }
      if (existing[0].is_blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
      }
      otpPhone = existing[0].phone;
    }

    // Invalidate previous OTPs
    await pool.query('UPDATE otps SET is_used = 1 WHERE phone IN (?) AND is_used = 0', [phoneCandidates]);

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 8);
    const otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    const [insertResult] = await pool.query(
      'INSERT INTO otps (phone, purpose, otp, expires_at) VALUES (?, ?, ?, ?)',
      [otpPhone, purpose, otpHash, expiresAt]
    );

    try {
      await sendOtpSms({ phone: e164Phone || otpPhone, otp, purpose, expiryMinutes: otpExpiryMinutes });
    } catch (smsError) {
      await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [insertResult.insertId]);
      throw smsError;
    }

    res.json({ message: 'OTP sent successfully.', ...(process.env.NODE_ENV !== 'production' && { otp }) });
  } catch (error) {
    next(error);
  }
};

// Verify OTP — for new user registration or MPIN reset
exports.verifyOTP = async (req, res, next) => {
  try {
    const phoneCandidates = getPhoneCandidates(req.body.phone);
    const { otp, purpose } = req.body;
    if (phoneCandidates.length === 0 || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required.' });
    }
    if (!['register', 'reset_mpin'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid OTP purpose.' });
    }

    const [otpRecords] = await pool.query(
      `SELECT * FROM otps WHERE phone IN (?) AND purpose = ? AND is_used = 0 AND expires_at > ${IST_NOW_SQL} ORDER BY id DESC LIMIT 1`,
      [phoneCandidates, purpose]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const isValidOtp = await bcrypt.compare(otp, otpRecords[0].otp);
    if (!isValidOtp) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRecords[0].id]);

    if (purpose === 'register') {
      // New user — return temp token for profile completion + MPIN setup
      const verifiedPhone = otpRecords[0].phone;
      const [existing] = await pool.query('SELECT id FROM users WHERE phone = ?', [verifiedPhone]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User already exists.' });
      }

      const tempToken = jwt.sign({ phone: verifiedPhone, purpose: 'profile_completion' }, process.env.JWT_SECRET, {
        expiresIn: '15m'
      });
      return res.json({ message: 'OTP verified. Complete your profile.', tempToken, isNewUser: true });
    }

    if (purpose === 'reset_mpin') {
      // Existing user — return temp token for MPIN reset
      const verifiedPhone = otpRecords[0].phone;
      const [users] = await pool.query('SELECT id, is_blocked FROM users WHERE phone = ?', [verifiedPhone]);
      if (users.length === 0) {
        return res.status(400).json({ error: 'User not found.' });
      }
      if (users[0].is_blocked) {
        return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
      }

      // Reset attempt counter on successful OTP verification
      await pool.query('UPDATE users SET mpin_attempts = 0, mpin_blocked_until = NULL WHERE id = ?', [users[0].id]);

      const tempToken = jwt.sign({ id: users[0].id, purpose: 'reset_mpin' }, process.env.JWT_SECRET, {
        expiresIn: '15m'
      });
      return res.json({ message: 'OTP verified. Set your new MPIN.', tempToken, resetMpin: true });
    }
  } catch (error) {
    next(error);
  }
};

// Complete profile (new user registration) — now also requires MPIN
exports.completeProfile = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, referralCode, mpin } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'profile_completion') {
      return res.status(401).json({ error: 'Invalid token for profile completion.' });
    }

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }

    if (!mpin || !/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ error: 'MPIN must be exactly 4 digits.' });
    }

    await conn.beginTransaction();

    let assignedModeratorId = null;
    let referrer = null;

    if (referralCode) {
      const [referrers] = await conn.query(
        'SELECT id, role, moderator_id FROM users WHERE referral_code = ? LIMIT 1',
        [referralCode]
      );
      referrer = referrers[0] || null;

      if (referrer?.role === 'moderator') {
        assignedModeratorId = referrer.id;
      } else if (referrer?.moderator_id) {
        assignedModeratorId = referrer.moderator_id;
      }
    }

    const mpinHash = await bcrypt.hash(mpin, 10);
    const userReferralCode = generateReferralCode();
    const [result] = await conn.query(
      'INSERT INTO users (name, phone, role, moderator_id, referral_code, mpin_hash, mpin_enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name.trim(), decoded.phone, 'user', assignedModeratorId, userReferralCode, mpinHash]
    );

    const userId = result.insertId;

    // Create wallet
    await conn.query('INSERT INTO wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)', [userId]);

    // Handle referral
    if (referrer) {
        const [settings] = await conn.query("SELECT setting_value FROM settings WHERE setting_key = 'referral_bonus'");
        const bonusAmount = settings.length > 0 ? parseFloat(settings[0].setting_value) : 0;

        if (bonusAmount > 0) {
          await conn.query('INSERT INTO referrals (referrer_id, referred_user_id, bonus_amount) VALUES (?, ?, ?)',
            [referrer.id, userId, bonusAmount]);

          // Lock wallet row before updating bonus_balance
          await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [referrer.id]);
          await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?',
            [bonusAmount, referrer.id]);

          await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
            [referrer.id, 'referral', bonusAmount, `ref_${userId}`]);

          // Record in wallet_transactions ledger
          const [[walletRow]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [referrer.id]);
          await conn.query(
            `INSERT INTO wallet_transactions
              (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
             VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
            [referrer.id, bonusAmount, parseFloat(walletRow.balance), `referral_${userId}`, `Referral bonus for user #${userId}`]
          );
        }
    }

    await conn.commit();

    const jwtToken = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    setAuthCookie(res, jwtToken);
    res.status(201).json({
      message: 'Profile created successfully.',
      token: jwtToken,
      user: {
        id: userId,
        name: name.trim(),
        phone: decoded.phone,
        role: 'user',
        referral_code: userReferralCode,
        moderator_id: assignedModeratorId,
      }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

// Set MPIN — for existing users who don't have MPIN yet (requires JWT)
exports.setMpin = async (req, res, next) => {
  try {
    const { mpin } = req.body;

    if (!mpin || !/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ error: 'MPIN must be exactly 4 digits.' });
    }

    const userId = req.user.id;
    const [users] = await pool.query('SELECT mpin_enabled FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (users[0].mpin_enabled) {
      return res.status(400).json({ error: 'MPIN is already set. Use reset flow to change it.' });
    }

    const mpinHash = await bcrypt.hash(mpin, 10);
    await pool.query('UPDATE users SET mpin_hash = ?, mpin_enabled = 1 WHERE id = ?', [mpinHash, userId]);

    res.json({ message: 'MPIN set successfully.' });
  } catch (error) {
    next(error);
  }
};

// Reset MPIN — after OTP verification for existing user
exports.resetMpin = async (req, res, next) => {
  try {
    const { mpin } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'reset_mpin') {
      return res.status(401).json({ error: 'Invalid token for MPIN reset.' });
    }

    if (!mpin || !/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ error: 'MPIN must be exactly 4 digits.' });
    }

    const mpinHash = await bcrypt.hash(mpin, 10);
    await pool.query(
      'UPDATE users SET mpin_hash = ?, mpin_enabled = 1, mpin_attempts = 0, mpin_blocked_until = NULL WHERE id = ?',
      [mpinHash, decoded.id]
    );

    res.json({ message: 'MPIN reset successfully. You can now login with your new MPIN.' });
  } catch (error) {
    next(error);
  }
};

// Login with MPIN — primary login for existing users
exports.loginMpin = async (req, res, next) => {
  try {
    const phoneCandidates = getPhoneCandidates(req.body.phone);
    const { mpin } = req.body;

    if (phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    if (!mpin || !/^\d{4}$/.test(mpin)) {
      return res.status(400).json({ error: 'MPIN must be exactly 4 digits.' });
    }

    const [users] = await pool.query(
      'SELECT id, name, phone, role, mpin_hash, mpin_enabled, mpin_attempts, mpin_blocked_until, is_blocked FROM users WHERE phone IN (?) AND role = ? LIMIT 1',
      [phoneCandidates, 'user']
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or MPIN.' });
    }

    const user = users[0];

    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
    }

    if (!user.mpin_enabled || !user.mpin_hash) {
      return res.status(400).json({ error: 'MPIN not set. Please set up your MPIN first.' });
    }

    // Check if user is temporarily blocked due to too many attempts
    if (user.mpin_blocked_until && new Date(user.mpin_blocked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.mpin_blocked_until) - new Date()) / 60000);
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        blockedUntil: user.mpin_blocked_until
      });
    }

    const isValid = await bcrypt.compare(mpin, user.mpin_hash);

    if (!isValid) {
      const newAttempts = (user.mpin_attempts || 0) + 1;
      const remaining = MAX_MPIN_ATTEMPTS - newAttempts;

      if (newAttempts >= MAX_MPIN_ATTEMPTS) {
        const blockedUntil = new Date(Date.now() + MPIN_BLOCK_MINUTES * 60 * 1000);
        await pool.query(
          'UPDATE users SET mpin_attempts = ?, mpin_blocked_until = ? WHERE id = ?',
          [newAttempts, blockedUntil, user.id]
        );
        return res.status(429).json({
          error: `Too many failed attempts. Account locked for ${MPIN_BLOCK_MINUTES} minutes.`,
          blockedUntil
        });
      }

      await pool.query('UPDATE users SET mpin_attempts = ? WHERE id = ?', [newAttempts, user.id]);
      return res.status(401).json({
        error: `Invalid MPIN. ${remaining} attempt(s) remaining.`
      });
    }

    // Reset attempts on successful login
    await pool.query('UPDATE users SET mpin_attempts = 0, mpin_blocked_until = NULL WHERE id = ?', [user.id]);

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    setAuthCookie(res, token);
    res.json({
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role }
    });
  } catch (error) {
    next(error);
  }
};

exports.adminLogin = async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const phoneCandidates = getPhoneCandidates(phone);
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required.' });
    }
    if (phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }

    const [users] = await pool.query(
      'SELECT id, name, phone, password, role, failed_login_attempts, login_blocked_until FROM users WHERE phone IN (?) AND role IN (?, ?) LIMIT 1',
      [phoneCandidates, 'admin', 'moderator']
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = users[0];

    // Check if account is temporarily locked
    if (user.login_blocked_until && new Date(user.login_blocked_until) > new Date()) {
      const remainingMin = Math.ceil((new Date(user.login_blocked_until) - new Date()) / 60000);
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${remainingMin} minute(s).` });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= MAX_ADMIN_LOGIN_ATTEMPTS) {
        await pool.query(
          'UPDATE users SET failed_login_attempts = ?, login_blocked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
          [attempts, ADMIN_LOGIN_BLOCK_MINUTES, user.id]
        );
        return res.status(429).json({ error: `Too many failed attempts. Account locked for ${ADMIN_LOGIN_BLOCK_MINUTES} minutes.` });
      }
      await pool.query('UPDATE users SET failed_login_attempts = ? WHERE id = ?', [attempts, user.id]);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Reset failed attempts on successful login
    if (user.failed_login_attempts > 0 || user.login_blocked_until) {
      await pool.query('UPDATE users SET failed_login_attempts = 0, login_blocked_until = NULL WHERE id = ?', [user.id]);
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const { password: _, failed_login_attempts: _a, login_blocked_until: _b, ...userWithoutPassword } = user;
    setAuthCookie(res, token);
    res.json({ message: 'Login successful.', token, user: userWithoutPassword });
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out.' });
};
