const pool = require('../config/database');
const { IST_NOW_SQL } = require('../utils/sql-time');

const LARGE_NEW_USER_DEPOSIT_THRESHOLD = 5000;
const LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS = 3;

exports.listUsers = async (req, res, next) => {
  try {
    const { search, role, moderator_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT u.id, u.name, u.phone, u.role, u.moderator_id, u.referral_code, u.is_blocked, u.created_at,
             w.balance, w.bonus_balance,
             m.name as moderator_name
      FROM users u
      LEFT JOIN wallets w ON u.id = w.user_id
      LEFT JOIN users m ON u.moderator_id = m.id
      WHERE 1=1
    `;
    const params = [];

    // Moderators can only see their assigned users
    if (req.user.role === 'moderator') {
      query += ' AND u.moderator_id = ?';
      params.push(req.user.id);
    }

    if (search) {
      query += ' AND (u.name LIKE ? OR u.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }
    if (moderator_id && req.user.role === 'admin') {
      if (moderator_id === 'unassigned') {
        query += ' AND u.moderator_id IS NULL';
      } else {
        query += ' AND u.moderator_id = ?';
        params.push(moderator_id);
      }
    }

    // Safe count query using a subquery
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countResult] = await pool.query(countQuery, params);

    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users] = await pool.query(query, params);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_blocked } = req.body;
    const [result] = await pool.query(
      "UPDATE users SET is_blocked = ? WHERE id = ? AND role = 'user'",
      [is_blocked ? 1 : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: is_blocked ? 'User blocked.' : 'User unblocked.' });
  } catch (error) {
    next(error);
  }
};

exports.getSettings = async (req, res, next) => {
  try {
    const [settings] = await pool.query('SELECT * FROM settings ORDER BY setting_key');
    res.json({ settings });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings array required.' });
    }

    for (const { key, value, description } of settings) {
      await pool.query(
        `INSERT INTO settings (setting_key, setting_value, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value, description || null]
      );
    }

    res.json({ message: 'Settings updated.' });
  } catch (error) {
    next(error);
  }
};

exports.getFlaggedAccounts = async (req, res, next) => {
  try {
    const [accounts] = await pool.query(`
      SELECT ba.*, u.name as user_name, u.phone as user_phone
      FROM bank_accounts ba
      JOIN users u ON ba.user_id = u.id
      WHERE ba.is_flagged = 1
      ORDER BY ba.created_at DESC
    `);
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};

exports.getModeratorStats = async (req, res, next) => {
  try {
    const [stats] = await pool.query(`
      SELECT m.id AS moderator_id,
             m.name AS moderator_name,
             m.upi_id,
             m.qr_code_image,
             m.scanner_label,
             COUNT(CASE WHEN d.status = 'approved' THEN 1 END) AS total_deposits,
             COALESCE(SUM(CASE WHEN d.status = 'approved' THEN d.amount ELSE 0 END), 0) AS total_amount,
             MAX(CASE WHEN d.status = 'approved' THEN d.created_at END) AS last_deposit_date
      FROM users m
      LEFT JOIN deposits d ON COALESCE(d.moderator_id, (SELECT u.moderator_id FROM users u WHERE u.id = d.user_id)) = m.id
      WHERE m.role = 'moderator'
      GROUP BY m.id, m.name, m.upi_id, m.qr_code_image, m.scanner_label
      ORDER BY total_amount DESC, m.name ASC
    `);

    res.json({ stats });
  } catch (error) {
    next(error);
  }
};

exports.getModeratorTransactions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [transactions] = await pool.query(`
      SELECT d.id, d.amount, d.utr_number, d.status,
             COALESCE(d.receipt_image, d.screenshot) AS receipt_image,
             d.created_at, d.reject_reason,
             approver.name AS approved_by_name,
             COALESCE(d.approved_by_role, approver.role) AS approved_by_role,
             u.name AS user_name,
             u.phone AS user_phone
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
      WHERE COALESCE(d.moderator_id, u.moderator_id) = ?
      ORDER BY d.created_at DESC
    `, [id]);

    res.json({ transactions });
  } catch (error) {
    next(error);
  }
};

exports.getModeratorFloatTable = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id AS moderator_id,
             u.name AS moderator_name,
             u.phone,
             u.referral_code,
             u.scanner_enabled,
             COALESCE(mw.balance, 0) AS float_balance,
             COUNT(CASE WHEN mwt.amount > 0 THEN 1 END) AS topup_count,
             COALESCE(SUM(CASE WHEN mwt.amount > 0 THEN mwt.amount ELSE 0 END), 0) AS total_topups,
             COALESCE(SUM(CASE WHEN mwt.amount < 0 THEN ABS(mwt.amount) ELSE 0 END), 0) AS total_deductions,
             MAX(mwt.created_at) AS last_transaction_at,
             MAX(CASE WHEN mwt.amount > 0 THEN mwt.created_at END) AS last_topup_at
      FROM users u
      LEFT JOIN moderator_wallet mw ON mw.moderator_id = u.id
      LEFT JOIN moderator_wallet_transactions mwt ON mwt.moderator_id = u.id
      WHERE u.role = 'moderator'
      GROUP BY u.id, u.name, u.phone, u.referral_code, u.scanner_enabled, mw.balance
      ORDER BY mw.balance ASC, u.name ASC
    `);

    res.json({ moderators: rows });
  } catch (error) {
    next(error);
  }
};

exports.getModeratorDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[moderatorRows], [depositTransactions], [floatTransactions], [assignedUsers], [notifications], [scannerAuditHistory]] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.upi_id, u.qr_code_image,
               u.scanner_label, u.scanner_enabled, u.is_blocked, u.created_at,
               COALESCE(mw.balance, 0) AS float_balance,
               (SELECT COUNT(*) FROM users assigned WHERE assigned.role = 'user' AND assigned.moderator_id = u.id) AS user_count,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE COALESCE(d.moderator_id, du.moderator_id) = u.id) AS total_related_deposits,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE COALESCE(d.moderator_id, du.moderator_id) = u.id AND d.status = 'pending') AS pending_deposits,
               (SELECT COALESCE(SUM(d.amount), 0) FROM deposits d JOIN users du ON du.id = d.user_id WHERE COALESCE(d.moderator_id, du.moderator_id) = u.id AND d.status = 'approved') AS approved_deposit_amount,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE COALESCE(d.moderator_id, du.moderator_id) = u.id AND d.status = 'approved') AS approved_deposit_count
        FROM users u
        LEFT JOIN moderator_wallet mw ON mw.moderator_id = u.id
        WHERE u.id = ? AND u.role = 'moderator'
        LIMIT 1
      `, [id]),
      pool.query(`
        SELECT d.id, d.amount, d.utr_number, d.status, d.reject_reason,
               COALESCE(d.receipt_image, d.screenshot) AS receipt_image,
               d.receipt_image_hash, d.created_at, COALESCE(d.approved_at, d.updated_at) AS reviewed_at,
               u.id AS user_id, u.name AS user_name, u.phone AS user_phone, u.created_at AS user_created_at,
               approver.id AS approved_by_id, approver.name AS approved_by_name,
               COALESCE(d.approved_by_role, approver.role) AS approved_by_role,
               CASE
                 WHEN d.amount >= ? AND TIMESTAMPDIFF(DAY, u.created_at, d.created_at) <= ? THEN 1
                 ELSE 0
               END AS large_new_user_flag
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
        WHERE COALESCE(d.moderator_id, u.moderator_id) = ?
        ORDER BY d.created_at DESC
      `, [LARGE_NEW_USER_DEPOSIT_THRESHOLD, LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS, id]),
      pool.query(`
        SELECT mwt.id, mwt.type, mwt.amount, mwt.balance_after, mwt.reference_id, mwt.remark, mwt.created_at,
               actor.id AS actor_id, actor.name AS actor_name, actor.role AS actor_role
        FROM moderator_wallet_transactions mwt
        LEFT JOIN users actor ON actor.id = mwt.created_by
        WHERE mwt.moderator_id = ?
        ORDER BY mwt.created_at DESC
      `, [id]),
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.is_blocked, u.created_at,
               COALESCE(w.balance, 0) AS balance,
               COALESCE(w.bonus_balance, 0) AS bonus_balance,
               (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS deposit_count,
               (SELECT COUNT(*) FROM withdraw_requests wr WHERE wr.user_id = u.id) AS withdraw_count,
               (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bet_count
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.role = 'user' AND u.moderator_id = ?
        ORDER BY u.created_at DESC
      `, [id]),
      pool.query(`
        SELECT id, type, message, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 30
      `, [id]),
      pool.query(`
        SELECT sal.id, sal.field_name, sal.old_value, sal.new_value, sal.created_at,
               actor.id AS actor_id,
               actor.name AS actor_name,
               COALESCE(sal.actor_role, actor.role) AS actor_role
        FROM moderator_scanner_audit_logs sal
        LEFT JOIN users actor ON actor.id = sal.actor_id
        WHERE sal.moderator_id = ?
        ORDER BY sal.created_at DESC, sal.id DESC
        LIMIT 100
      `, [id]),
    ]);

    if (moderatorRows.length === 0) {
      return res.status(404).json({ error: 'Moderator not found.' });
    }

    res.json({
      moderator: moderatorRows[0],
      deposit_transactions: depositTransactions,
      float_transactions: floatTransactions,
      assigned_users: assignedUsers,
      notifications,
      scanner_audit_history: scannerAuditHistory,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[userRows], [deposits], [withdrawals], [walletTransactions], [bets], [bonuses], [bankAccounts], [notifications]] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.is_blocked, u.created_at, u.updated_at,
               u.moderator_id, m.name AS moderator_name, m.phone AS moderator_phone,
               COALESCE(w.balance, 0) AS balance, COALESCE(w.bonus_balance, 0) AS bonus_balance
        FROM users u
        LEFT JOIN users m ON m.id = u.moderator_id
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.id = ? AND u.role = 'user'
        LIMIT 1
      `, [id]),
      pool.query(`
        SELECT d.id, d.amount, d.utr_number, d.status, d.reject_reason,
               COALESCE(d.receipt_image, d.screenshot) AS receipt_image,
               d.receipt_image_hash, d.created_at, COALESCE(d.approved_at, d.updated_at) AS reviewed_at,
               moderator.id AS moderator_id, moderator.name AS moderator_name,
               approver.id AS approved_by_id, approver.name AS approved_by_name,
               COALESCE(d.approved_by_role, approver.role) AS approved_by_role
        FROM deposits d
        LEFT JOIN users moderator ON moderator.id = d.moderator_id
        LEFT JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
        WHERE d.user_id = ?
        ORDER BY d.created_at DESC
      `, [id]),
      pool.query(`
        SELECT wr.id, wr.amount, wr.status, wr.reject_reason, wr.created_at, wr.updated_at,
               approver.id AS approved_by_id, approver.name AS approved_by_name,
               ba.id AS bank_id, ba.bank_name, ba.account_holder, ba.account_number, ba.ifsc, ba.is_flagged
        FROM withdraw_requests wr
        JOIN bank_accounts ba ON ba.id = wr.bank_id
        LEFT JOIN users approver ON approver.id = wr.approved_by
        WHERE wr.user_id = ?
        ORDER BY wr.created_at DESC
      `, [id]),
      pool.query(`
        SELECT id, type, amount, balance_after, status, reference_type, reference_id, remark, created_at
        FROM wallet_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [id]),
      pool.query(`
        SELECT b.id, b.type, b.total_amount, b.win_amount, b.status, b.created_at,
               g.name AS game_name,
               gr.result_number, gr.result_date,
               GROUP_CONCAT(CONCAT(bn.number, ' (₹', FORMAT(bn.amount, 2), ')') ORDER BY bn.id SEPARATOR ', ') AS bet_numbers
        FROM bets b
        JOIN games g ON g.id = b.game_id
        LEFT JOIN game_results gr ON gr.id = b.game_result_id
        LEFT JOIN bet_numbers bn ON bn.bet_id = b.id
        WHERE b.user_id = ?
        GROUP BY b.id, b.type, b.total_amount, b.win_amount, b.status, b.created_at, g.name, gr.result_number, gr.result_date
        ORDER BY b.created_at DESC
      `, [id]),
      pool.query(`
        SELECT id, type, amount, reference_id, created_at
        FROM bonuses
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [id]),
      pool.query(`
        SELECT id, account_number, ifsc, bank_name, account_holder, is_flagged, flag_reason, created_at
        FROM bank_accounts
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [id]),
      pool.query(`
        SELECT id, type, message, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `, [id]),
    ]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      user: userRows[0],
      deposits,
      withdrawals,
      wallet_transactions: walletTransactions,
      bets,
      bonuses,
      bank_accounts: bankAccounts,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

exports.getFraudLogs = async (req, res, next) => {
  try {
    const [logs] = await pool.query(`
      SELECT l.id, l.utr, l.created_at,
             attempted.id AS attempt_user_id,
             attempted.name AS attempt_user_name,
             attempted.phone AS attempt_user_phone,
             original.id AS original_user_id,
             original.name AS original_user_name,
             original.phone AS original_user_phone
      FROM utr_attempt_logs l
      JOIN users attempted ON attempted.id = l.attempt_user_id
      LEFT JOIN users original ON original.id = l.original_user_id
      ORDER BY l.created_at DESC
    `);

    res.json({ logs });
  } catch (error) {
    next(error);
  }
};

exports.getFraudAlerts = async (req, res, next) => {
  try {
    const [duplicateUtrs, reusedReceipts, excessiveApprovals, largeNewUserDeposits] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS attempts_today
        FROM utr_attempt_logs
        WHERE DATE(created_at) = DATE(${IST_NOW_SQL})
      `),
      pool.query(`
        SELECT receipt_image_hash, COUNT(*) AS duplicate_count,
               GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') AS users,
               GROUP_CONCAT(DISTINCT d.utr_number ORDER BY d.utr_number SEPARATOR ', ') AS utrs
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        WHERE d.receipt_image_hash IS NOT NULL
        GROUP BY d.receipt_image_hash
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT approver.id AS approver_id, approver.name AS approver_name,
               COALESCE(d.approved_by_role, approver.role) AS approver_role,
               COUNT(*) AS approval_count
        FROM deposits d
        JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
        WHERE d.status = 'approved'
          AND DATE(COALESCE(d.approved_at, d.updated_at)) = DATE(${IST_NOW_SQL})
        GROUP BY approver.id, approver.name, COALESCE(d.approved_by_role, approver.role)
        HAVING COUNT(*) >= 10
        ORDER BY approval_count DESC
      `),
      pool.query(`
        SELECT d.id, d.amount, d.created_at, u.name AS user_name, u.phone AS user_phone,
               TIMESTAMPDIFF(HOUR, u.created_at, d.created_at) AS account_age_hours
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        WHERE d.amount >= ?
          AND TIMESTAMPDIFF(DAY, u.created_at, d.created_at) <= ?
        ORDER BY d.amount DESC, d.created_at DESC
        LIMIT 20
      `, [LARGE_NEW_USER_DEPOSIT_THRESHOLD, LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS]),
    ]);

    res.json({
      summary: {
        fraud_attempts_today: duplicateUtrs[0][0]?.attempts_today || 0,
        reused_receipt_groups: reusedReceipts[0].length,
        excessive_approver_count: excessiveApprovals[0].length,
        large_new_user_deposit_count: largeNewUserDeposits[0].length,
      },
      reused_receipts: reusedReceipts[0],
      excessive_approvals: excessiveApprovals[0],
      large_new_user_deposits: largeNewUserDeposits[0],
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [[depositsToday], [fraudToday], [activeModerators]] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total_deposits_today,
               COALESCE(SUM(amount), 0) AS total_amount_today
        FROM deposits
        WHERE status = 'approved'
          AND DATE(COALESCE(approved_at, updated_at)) = DATE(${IST_NOW_SQL})
      `),
      pool.query(`
        SELECT COUNT(*) AS fraud_attempts_today
        FROM utr_attempt_logs
        WHERE DATE(created_at) = DATE(${IST_NOW_SQL})
      `),
      pool.query(`
        SELECT COUNT(*) AS active_moderators
        FROM users
        WHERE role = 'moderator' AND is_blocked = 0 AND scanner_enabled = 1
      `),
    ]);

    res.json({
      total_deposits_today: depositsToday[0]?.total_deposits_today || 0,
      total_amount_today: parseFloat(depositsToday[0]?.total_amount_today || 0),
      fraud_attempts_today: fraudToday[0]?.fraud_attempts_today || 0,
      active_moderators: activeModerators[0]?.active_moderators || 0,
    });
  } catch (error) {
    next(error);
  }
};

// ── Payout Rates ──────────────────────────────────────────────────────

exports.getPayoutRates = async (req, res, next) => {
  try {
    const [rates] = await pool.query(
      'SELECT id, game_type, multiplier, updated_at FROM game_payout_rates ORDER BY game_type'
    );
    res.json({ rates });
  } catch (error) {
    next(error);
  }
};

exports.updatePayoutRates = async (req, res, next) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ error: 'Rates array required.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const { game_type, multiplier } of rates) {
        const mult = parseFloat(multiplier);
        if (!game_type || isNaN(mult) || mult <= 0) {
          await conn.rollback();
          return res.status(400).json({ error: `Invalid rate for "${game_type}".` });
        }
        await conn.query(
          'UPDATE game_payout_rates SET multiplier = ?, updated_by = ?, updated_at = NOW() WHERE game_type = ?',
          [mult, req.user.id, game_type]
        );
      }
      await conn.commit();
      res.json({ message: 'Payout rates updated.' });
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

// ── Bonus Rates ───────────────────────────────────────────────────────

exports.getBonusRates = async (req, res, next) => {
  try {
    const [rates] = await pool.query(
      'SELECT id, game_type, bonus_multiplier, updated_at FROM game_bonus_rates ORDER BY game_type'
    );
    res.json({ rates });
  } catch (error) {
    next(error);
  }
};

exports.updateBonusRates = async (req, res, next) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ error: 'Rates array required.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const { game_type, bonus_multiplier } of rates) {
        const mult = parseFloat(bonus_multiplier);
        if (!game_type || isNaN(mult) || mult < 0) {
          await conn.rollback();
          return res.status(400).json({ error: `Invalid bonus rate for "${game_type}".` });
        }
        await conn.query(
          'UPDATE game_bonus_rates SET bonus_multiplier = ?, updated_by = ?, updated_at = NOW() WHERE game_type = ?',
          [mult, req.user.id, game_type]
        );
      }
      await conn.commit();
      res.json({ message: 'Bonus rates updated.' });
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};
