const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { getPhoneCandidates, toE164Phone } = require('../utils/phone');

function generateReferralCode() {
  // Simple format: M + 5 digits (e.g. M55555, M11111)
  const digits = Math.floor(10000 + Math.random() * 90000).toString();
  return 'M' + digits;
}

function validateReferralCode(code) {
  const value = String(code || '').trim();
  if (!value) return { isValid: false, message: 'Referral code is required.' };
  if (!/^M\d{5}$/.test(value)) return { isValid: false, message: 'Referral code must be M followed by 5 digits (e.g. M55555).' };
  return { isValid: true, message: '' };
}

exports.createModerator = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Validate and normalize phone
    const phoneCandidates = getPhoneCandidates(phone);
    if (phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    const normalizedPhone = toE164Phone(phone) || phoneCandidates[0];

    // Check for duplicate phone across all candidate formats
    const [existingUsers] = await conn.query(
      'SELECT id FROM users WHERE phone IN (?) LIMIT 1',
      [phoneCandidates]
    );
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'A user with this phone number already exists.' });
    }

    await conn.beginTransaction();

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();

    const [result] = await conn.query(
      'INSERT INTO users (name, phone, password, role, referral_code) VALUES (?, ?, ?, ?, ?)',
      [name, normalizedPhone, hashedPassword, 'moderator', referralCode]
    );

    await conn.query('INSERT INTO wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)', [result.insertId]);

    await conn.commit();

    res.status(201).json({
      message: 'Moderator created.',
      moderator: { id: result.insertId, name, phone, referral_code: referralCode }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.listModerators = async (req, res, next) => {
  try {
    const [moderators] = await pool.query(`
          SELECT u.id, u.name, u.phone, u.referral_code,
             u.is_blocked, u.created_at,
             (SELECT COUNT(*) FROM users WHERE moderator_id = u.id) as user_count,
             (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referral_count,
             (SELECT COALESCE(SUM(bonus_amount), 0) FROM referrals WHERE referrer_id = u.id) as referral_amount
          FROM users u
          WHERE u.role = 'moderator' AND u.is_deleted = 0
      ORDER BY u.created_at DESC
    `);
    res.json({ moderators });
  } catch (error) {
    next(error);
  }
};

exports.updateModerator = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, is_blocked, password, referral_code } = req.body;

    const [moderators] = await pool.query(
      `SELECT id FROM users WHERE id = ? AND role = 'moderator' LIMIT 1`,
      [id]
    );

    if (moderators.length === 0) {
      return res.status(404).json({ error: 'Moderator not found.' });
    }

    // Validate referral code if provided
    if (referral_code !== undefined) {
      const validation = validateReferralCode(referral_code);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
      // Check uniqueness
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE referral_code = ? AND id != ?',
        [referral_code.trim(), id]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'This referral code is already in use.' });
      }
    }

    const fields = [];
    const values = [];

    if (name) { fields.push('name = ?'); values.push(name); }
    if (phone) { fields.push('phone = ?'); values.push(phone); }
    if (is_blocked !== undefined) { fields.push('is_blocked = ?'); values.push(is_blocked); }
    if (referral_code !== undefined) { fields.push('referral_code = ?'); values.push(referral_code.trim()); }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND role = 'moderator'`, values);

    res.json({ message: 'Moderator updated.' });
  } catch (error) {
    next(error);
  }
};

exports.deleteModerator = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Soft delete: mark as deleted, unassign users
    await pool.query('UPDATE users SET moderator_id = NULL WHERE moderator_id = ?', [id]);
    await pool.query(
      "UPDATE users SET is_deleted = 1, is_blocked = 1 WHERE id = ? AND role = 'moderator'",
      [id]
    );
    res.json({ message: 'Moderator archived.' });
  } catch (error) {
    next(error);
  }
};

exports.assignUsers = async (req, res, next) => {
  try {
    const { moderator_id, user_ids } = req.body;
    if (!moderator_id || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: 'moderator_id and user_ids array required.' });
    }

    const placeholders = user_ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE users SET moderator_id = ? WHERE id IN (${placeholders}) AND role = 'user'`,
      [moderator_id, ...user_ids]
    );

    res.json({ message: `${user_ids.length} users assigned to moderator.` });
  } catch (error) {
    next(error);
  }
};
