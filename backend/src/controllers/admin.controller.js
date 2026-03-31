const pool = require('../config/database');
const { clampPagination, escapeLike } = require('../utils/pagination');

const LARGE_NEW_USER_DEPOSIT_THRESHOLD = 5000;
const LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS = 3;

exports.listUsers = async (req, res, next) => {
  try {
    const { search, role, moderator_id } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

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
      const escaped = escapeLike(search);
      params.push(`%${escaped}%`, `%${escaped}%`);
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
    params.push(limit, offset);

    const [users] = await pool.query(query, params);

    res.json({
      users,
      pagination: {
        page,
        limit,
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
             m.scanner_label,
             COUNT(d.id) AS total_deposits,
             COALESCE(SUM(d.amount), 0) AS total_amount,
             MAX(d.created_at) AS last_deposit_date
      FROM users m
      LEFT JOIN users u2 ON u2.moderator_id = m.id AND u2.role = 'user'
      LEFT JOIN deposits d ON d.user_id = u2.id AND d.status = 'completed'
      WHERE m.role = 'moderator' AND m.is_deleted = 0
      GROUP BY m.id, m.name, m.upi_id, m.scanner_label
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
             d.payer_name, d.created_at,
             u.name AS user_name,
             u.phone AS user_phone
      FROM deposits d
      JOIN users u ON u.id = d.user_id
      WHERE u.moderator_id = ?
      ORDER BY d.created_at DESC
      LIMIT 200
    `, [id]);

    res.json({ transactions });
  } catch (error) {
    next(error);
  }
};

exports.getModeratorDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[moderatorRows], [depositTransactions], [assignedUsers], [notifications], [scannerAuditHistory]] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.upi_id,
               u.scanner_label, u.scanner_enabled, u.is_blocked, u.created_at,
               (SELECT COUNT(*) FROM users assigned WHERE assigned.role = 'user' AND assigned.moderator_id = u.id) AS user_count,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE du.moderator_id = u.id) AS total_related_deposits,
               (
                 SELECT COUNT(*)
                 FROM pending_deposit_orders pdo
                 JOIN users u2 ON u2.id = pdo.user_id
                 WHERE u2.moderator_id = u.id AND pdo.status = 'pending' AND pdo.expires_at > NOW()
               ) AS pending_deposits,
               (SELECT COALESCE(SUM(d.amount), 0) FROM deposits d JOIN users du ON du.id = d.user_id WHERE du.moderator_id = u.id AND d.status = 'completed') AS approved_deposit_amount,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE du.moderator_id = u.id AND d.status = 'completed') AS approved_deposit_count
        FROM users u
        WHERE u.id = ? AND u.role = 'moderator'
        LIMIT 1
      `, [id]),
      pool.query(`
        SELECT d.id, d.amount, d.utr_number, d.status,
               d.payer_name, d.created_at,
               u.id AS user_id, u.name AS user_name, u.phone AS user_phone, u.created_at AS user_created_at
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        WHERE u.moderator_id = ?
        ORDER BY d.created_at DESC
        LIMIT 200
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
        SELECT d.id, d.amount, d.utr_number, d.status,
               d.payer_name, d.created_at
        FROM deposits d
        WHERE d.user_id = ?
        ORDER BY d.created_at DESC
        LIMIT 200
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
        LIMIT 200
      `, [id]),
      pool.query(`
        SELECT id, type, amount, balance_after, status, reference_type, reference_id, remark, created_at
        FROM wallet_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 200
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
        LIMIT 200
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
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      "SELECT COUNT(*) as total FROM auto_deposit_logs WHERE action IN ('duplicate_ref', 'duplicate_utr', 'user_blocked')"
    );

    const [logs] = await pool.query(`
      SELECT adl.id, adl.action, adl.details, adl.created_at,
             adl.webhook_txn_id, adl.order_id, adl.deposit_id,
             u.id AS user_id, u.name AS user_name, u.phone AS user_phone
      FROM auto_deposit_logs adl
      LEFT JOIN users u ON u.id = adl.user_id
      WHERE adl.action IN ('duplicate_ref', 'duplicate_utr', 'user_blocked')
      ORDER BY adl.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getFraudAlerts = async (req, res, next) => {
  try {
    const [duplicateRefs, duplicatePayers, largeNewUserDeposits] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS attempts_today
        FROM auto_deposit_logs
        WHERE action IN ('duplicate_ref', 'duplicate_utr')
          AND DATE(created_at) = CURDATE()
      `),
      pool.query(`
        SELECT payer_name, COUNT(*) AS txn_count, COUNT(DISTINCT matched_order_id) AS distinct_orders
        FROM upi_webhook_transactions
        WHERE status = 'matched'
          AND payer_name IS NOT NULL
          AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY payer_name
        HAVING txn_count > 3
        ORDER BY txn_count DESC
        LIMIT 20
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
        fraud_attempts_today: duplicateRefs[0][0]?.attempts_today || 0,
        suspicious_payer_count: duplicatePayers[0].length,
        large_new_user_deposit_count: largeNewUserDeposits[0].length,
      },
      suspicious_payers: duplicatePayers[0],
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
        WHERE status = 'completed'
          AND DATE(created_at) = CURDATE()
      `),
      pool.query(`
        SELECT COUNT(*) AS fraud_attempts_today
        FROM auto_deposit_logs
        WHERE action IN ('duplicate_ref', 'duplicate_utr')
          AND DATE(created_at) = CURDATE()
      `),
      pool.query(`
        SELECT COUNT(*) AS active_moderators
        FROM users
        WHERE role = 'moderator' AND is_blocked = 0 AND is_deleted = 0 AND scanner_enabled = 1
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

exports.getUpiManagement = async (req, res, next) => {
  try {
    const [moderators, admins, auditLogs, depositStats] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.upi_id,
               u.scanner_label, u.scanner_enabled, u.is_blocked, u.created_at, u.updated_at,
               (SELECT COUNT(*) FROM users assigned WHERE assigned.role = 'user' AND assigned.moderator_id = u.id) AS user_count
        FROM users u
        WHERE u.role = 'moderator' AND u.is_deleted = 0
        ORDER BY u.scanner_enabled DESC, u.name ASC
      `),
      pool.query(`
        SELECT u.id, u.name, u.phone, u.upi_id, u.updated_at
        FROM users u
        WHERE u.role = 'admin'
      `),
      pool.query(`
        SELECT sal.id, sal.moderator_id, sal.field_name, sal.old_value, sal.new_value, sal.created_at,
               sal.actor_role,
               actor.name AS actor_name,
               target.name AS moderator_name
        FROM moderator_scanner_audit_logs sal
        LEFT JOIN users actor ON actor.id = sal.actor_id
        LEFT JOIN users target ON target.id = sal.moderator_id
        ORDER BY sal.created_at DESC
        LIMIT 200
      `),
      pool.query(`
        SELECT m.id AS moderator_id,
               COUNT(d.id) AS total_deposits,
               COALESCE(SUM(d.amount), 0) AS total_collected,
               COALESCE(SUM(CASE WHEN d.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN d.amount ELSE 0 END), 0) AS collected_today,
               COALESCE(SUM(CASE WHEN d.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN d.amount ELSE 0 END), 0) AS collected_7d,
               COALESCE(SUM(CASE WHEN d.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN d.amount ELSE 0 END), 0) AS collected_30d,
               MAX(d.created_at) AS last_deposit_at
        FROM users m
        LEFT JOIN users u2 ON u2.moderator_id = m.id AND u2.role = 'user'
        LEFT JOIN deposits d ON d.user_id = u2.id AND d.status = 'completed'
        WHERE m.role = 'moderator' AND m.is_deleted = 0
        GROUP BY m.id
      `)
    ]);

    const statsMap = {};
    depositStats[0].forEach(row => { statsMap[row.moderator_id] = row; });

    const enrichedModerators = moderators[0].map(mod => ({
      ...mod,
      total_deposits: statsMap[mod.id]?.total_deposits || 0,
      total_collected: Number(statsMap[mod.id]?.total_collected || 0),
      collected_today: Number(statsMap[mod.id]?.collected_today || 0),
      collected_7d: Number(statsMap[mod.id]?.collected_7d || 0),
      collected_30d: Number(statsMap[mod.id]?.collected_30d || 0),
      last_deposit_at: statsMap[mod.id]?.last_deposit_at || null,
    }));

    res.json({
      moderators: enrichedModerators,
      admins: admins[0],
      audit_logs: auditLogs[0],
    });
  } catch (error) {
    next(error);
  }
};

exports.updateAdminUpi = async (req, res, next) => {
  try {
    const { upi_id } = req.body;
    const adminId = req.user.id;

    // Validate UPI format
    const value = String(upi_id || '').trim();
    if (value) {
      if (!value.includes('@')) {
        return res.status(400).json({ error: 'UPI ID must include @handle.' });
      }
      const [username, handle, ...extra] = value.split('@');
      if (!username || !handle || extra.length > 0) {
        return res.status(400).json({ error: 'UPI ID must be in format name@provider.' });
      }
      if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) {
        return res.status(400).json({ error: 'UPI user part contains invalid characters.' });
      }
      if (!/^[a-zA-Z0-9.-]{2,}$/.test(handle)) {
        return res.status(400).json({ error: 'UPI handle contains invalid characters.' });
      }
    }

    await pool.query(
      'UPDATE users SET upi_id = ? WHERE id = ? AND role = ?',
      [value || null, adminId, 'admin']
    );

    res.json({ message: 'Admin UPI updated.' });
  } catch (error) {
    next(error);
  }
};
