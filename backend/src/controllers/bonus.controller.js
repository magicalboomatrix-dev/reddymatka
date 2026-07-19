const pool = require('../config/database');
const { IST_DATE_SQL } = require('../utils/sql-time');

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

    // Check if current user has a pending referral bonus (they were referred)
    const [myReferral] = await pool.query(
      "SELECT r.id, r.bonus_amount, r.status, u.name as referrer_name FROM referrals r JOIN users u ON r.referrer_id = u.id WHERE r.referred_user_id = ? LIMIT 1",
      [req.user.id]
    );

    res.json({
      referrals,
      referral_code: req.user.referral_code,
      my_referral: myReferral[0] || null,
    });
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

exports.claimDailyBonus = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    // Read daily bonus amount from settings (default ₹5 if not configured)
    const [settings] = await conn.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'daily_bonus_amount' LIMIT 1"
    );
    const bonusAmount = parseFloat(settings[0]?.setting_value || 5);
    if (bonusAmount <= 0) {
      return res.status(400).json({ error: 'Daily bonus is not available.' });
    }

    await conn.beginTransaction();

    // Insert into daily_bonus_claims — UNIQUE(user_id, claim_date) prevents double claim
    const [insert] = await conn.query(
      `INSERT IGNORE INTO daily_bonus_claims (user_id, claim_date, amount)
       VALUES (?, (${IST_DATE_SQL}), ?)`,
      [req.user.id, bonusAmount]
    );

    if (insert.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Daily bonus already claimed today.' });
    }

    // Record in bonuses table for history
    await conn.query(
      "INSERT INTO bonuses (user_id, type, amount) VALUES (?, 'daily', ?)",
      [req.user.id, bonusAmount]
    );

    // Credit daily bonus to bonus_balance (not withdrawable, used for bets)
    await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [req.user.id]);
    await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?', [bonusAmount, req.user.id]);

    const [[walletRow]] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [req.user.id]);
    const effectiveBalance = parseFloat(walletRow.balance) + parseFloat(walletRow.bonus_balance);
    await conn.query(
      `INSERT INTO wallet_transactions
        (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
       VALUES (?, 'bonus', ?, ?, 'completed', 'daily_bonus', ?, ?)`,
      [req.user.id, bonusAmount, effectiveBalance, `daily_${req.user.id}_${new Date().toLocaleDateString('en-CA')}`, 'Daily login bonus']
    );

    await conn.commit();

    res.json({
      message: `Daily bonus of ₹${bonusAmount} credited to bonus balance.`,
      bonus_amount: bonusAmount,
      new_balance: parseFloat(walletRow.balance),
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};
