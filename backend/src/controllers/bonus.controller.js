const pool = require('../config/database');

exports.getBonusHistory = async (req, res, next) => {
  try {
    const [bonuses] = await pool.query(
      'SELECT * FROM bonuses WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ bonuses });
  } catch (error) {
    next(error);
  }
};

exports.getReferrals = async (req, res, next) => {
  try {
    const [referrals] = await pool.query(`
      SELECT r.*, u.name as referred_name, u.phone as referred_phone
      FROM referrals r
      JOIN users u ON r.referred_user_id = u.id
      WHERE r.referrer_id = ?
      ORDER BY r.created_at DESC
    `, [req.user.id]);

    res.json({ referrals, referral_code: req.user.referral_code });
  } catch (error) {
    next(error);
  }
};

exports.getBonusRules = async (req, res, next) => {
  try {
    const [settings] = await pool.query(
      "SELECT setting_key, setting_value, description FROM settings WHERE setting_key LIKE 'bonus_%' OR setting_key LIKE 'referral_%' OR setting_key = 'first_deposit_bonus_percent'"
    );
    res.json({ rules: settings });
  } catch (error) {
    next(error);
  }
};
