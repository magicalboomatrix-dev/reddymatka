const pool = require('../config/database');
const { clampPagination, escapeLike } = require('../utils/pagination');
const { invalidateUserCache } = require('../middleware/auth.middleware');
const { IST_NOW_SQL, IST_DATE_SQL } = require('../utils/sql-time');

const LARGE_NEW_USER_DEPOSIT_THRESHOLD = 5000;
const LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS = 3;

function normalizeSearchTerm(value) {
  return String(value || '').trim();
}

function buildSearchPattern(value) {
  return `%${escapeLike(normalizeSearchTerm(value))}%`;
}

exports.getDashboardOverview = async (req, res, next) => {
  try {
    const isModerator = req.user.role === 'moderator';
    const userScopeClause = isModerator ? ' AND moderator_id = ?' : '';
    const userScopeParams = isModerator ? [req.user.id] : [];

    const currentDayFilter = (column) =>
      `${column} >= ${IST_DATE_SQL} AND ${column} < ${IST_DATE_SQL} + INTERVAL 1 DAY`;

    const [
      [userCountRows],
      [depositsTodayRows],
      [withdrawalsTodayRows],
      [betsTodayRows],
      [pendingWithdrawalsRows],
      [pendingDepositsRows],
      [totalBalanceRows],
      [recentBetsRows],
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count FROM users WHERE role = 'user'${userScopeClause}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(d.amount), 0) as total
         FROM deposits d
         JOIN users u ON d.user_id = u.id
         WHERE ${currentDayFilter('d.created_at')} AND d.status = 'completed'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(wr.amount), 0) as total
         FROM withdraw_requests wr
         JOIN users u ON wr.user_id = u.id
         WHERE ${currentDayFilter('wr.created_at')} AND wr.status = 'approved'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(b.total_amount), 0) as total
         FROM bets b
         JOIN users u ON b.user_id = u.id
         WHERE ${currentDayFilter('b.created_at')}${isModerator ? ' AND u.moderator_id = ?' : ''}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COUNT(*) as count
         FROM withdraw_requests wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.status = 'pending'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COUNT(*) as count
         FROM deposits d
         JOIN users u ON d.user_id = u.id
         WHERE d.status = 'pending'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
        userScopeParams
      ),
      pool.query(
        `SELECT COALESCE(SUM(w.balance), 0) as total
         FROM wallets w
         JOIN users u ON w.user_id = u.id
         WHERE u.role = 'user'${userScopeClause}`,
        userScopeParams
      ),
      pool.query(
        `SELECT b.*, u.name as user_name, g.name as game_name
         FROM bets b
         JOIN users u ON b.user_id = u.id
         JOIN games g ON b.game_id = g.id
         WHERE 1 = 1${isModerator ? ' AND u.moderator_id = ?' : ''}
         ORDER BY b.created_at DESC LIMIT 10`,
        userScopeParams
      ),
    ]);

    res.json({
      stats: {
        total_users: userCountRows[0].count,
        deposits_today: { count: depositsTodayRows[0].count, total: parseFloat(depositsTodayRows[0].total) },
        withdrawals_today: { count: withdrawalsTodayRows[0].count, total: parseFloat(withdrawalsTodayRows[0].total) },
        bets_today: { count: betsTodayRows[0].count, total: parseFloat(betsTodayRows[0].total) },
        pending_deposits: pendingDepositsRows[0].count,
        pending_withdrawals: pendingWithdrawalsRows[0].count,
        total_wallet_balance: parseFloat(totalBalanceRows[0].total),
      },
      recent_bets: recentBetsRows,
    });
  } catch (error) {
    next(error);
  }
};

exports.getRevenueOverview = async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    let interval;
    switch (period) {
      case '30d': interval = 30; break;
      case '90d': interval = 90; break;
      default: interval = 7;
    }

    const [deposits] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(amount) as total
      FROM deposits
      WHERE status = 'completed' AND created_at >= DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date
    `, [interval]);

    const [withdrawals] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(amount) as total
      FROM withdraw_requests
      WHERE status = 'approved' AND created_at >= DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date
    `, [interval]);

    const [bets] = await pool.query(`
      SELECT DATE_FORMAT(COALESCE(session_date, DATE(created_at)), '%Y-%m-%d') as date,
             SUM(total_amount) as total_bet,
             SUM(win_amount) as total_win
      FROM bets
      WHERE COALESCE(session_date, DATE(created_at)) >= DATE(DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY))
      GROUP BY DATE_FORMAT(COALESCE(session_date, DATE(created_at)), '%Y-%m-%d') ORDER BY date
    `, [interval]);

    res.json({ deposits, withdrawals, bets, period });
  } catch (error) {
    next(error);
  }
};

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

    // Evict cached user row so the new block state is seen on next request
    await invalidateUserCache(id);

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
             COUNT(d.id) AS total_deposits,
             COALESCE(SUM(d.amount), 0) AS total_amount,
             MAX(d.created_at) AS last_deposit_date
      FROM users m
      LEFT JOIN users u2 ON u2.moderator_id = m.id AND u2.role = 'user'
      LEFT JOIN deposits d ON d.user_id = u2.id AND d.status = 'completed'
      WHERE m.role = 'moderator' AND m.is_deleted = 0
      GROUP BY m.id, m.name
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
    const [[moderatorRows], [depositTransactions], [assignedUsers], [notifications], [referredUsers]] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.is_blocked, u.created_at,
               (SELECT COUNT(*) FROM users assigned WHERE assigned.role = 'user' AND assigned.moderator_id = u.id) AS user_count,
               (SELECT COUNT(*) FROM deposits d JOIN users du ON du.id = d.user_id WHERE du.moderator_id = u.id) AS total_related_deposits,
                (
                  SELECT COUNT(*)
                  FROM deposits d2
                  JOIN users u2 ON u2.id = d2.user_id
                  WHERE u2.moderator_id = u.id AND d2.status = 'pending'
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
        SELECT r.id, r.referred_user_id, r.bonus_amount, r.status, r.created_at, r.credited_at,
               u.name AS user_name, u.phone AS user_phone
        FROM referrals r
        JOIN users u ON u.id = r.referred_user_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC
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
      referred_users: referredUsers,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isModerator = req.user.role === 'moderator';

    // Moderators may only view details of users assigned to them
    if (isModerator) {
      const [ownership] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND role = 'user' AND moderator_id = ? LIMIT 1",
        [id, req.user.id]
      );
      if (ownership.length === 0) {
        return res.status(403).json({ error: 'Access denied. User not assigned to you.' });
      }
    }

    const [[userRows], [deposits], [withdrawals], [walletTransactions], [bets], [bonuses], [bankAccounts], [notifications], [activityLogs]] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.phone, u.referral_code, u.is_blocked, u.is_18_plus, u.created_at, u.updated_at,
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
         SELECT wr.id, wr.bank_id, wr.withdraw_method, wr.upi_id, wr.phone_number,
           wr.amount, wr.status, wr.reject_reason, wr.checked_by, wr.checked_at, wr.checker_notes, wr.otp_verified, wr.created_at, wr.updated_at,
               checker.name AS checked_by_name,
               approver.id AS approved_by_id, approver.name AS approved_by_name,
               ba.id AS bank_id, ba.bank_name, ba.account_holder, ba.account_number, ba.ifsc, ba.is_flagged
        FROM withdraw_requests wr
        LEFT JOIN bank_accounts ba ON ba.id = wr.bank_id
        LEFT JOIN users checker ON checker.id = wr.checked_by
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
      pool.query(`
        SELECT id, action, entity_type, entity_id, details, ip_address, user_agent, created_at
        FROM user_activity_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 200
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
      activity_logs: activityLogs,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserActivityLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = clampPagination(req.query);

    if (req.user?.role === 'moderator') {
      const [ownership] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND role = 'user' AND moderator_id = ? LIMIT 1",
        [id, req.user.id]
      );
      if (ownership.length === 0) {
        return res.status(403).json({ error: 'Access denied. User not assigned to you.' });
      }
    }

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM user_activity_logs WHERE user_id = ?',
      [id]
    );

    const [logs] = await pool.query(
      `SELECT id, user_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at
       FROM user_activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [[depositsToday], [activeModerators]] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total_deposits_today,
               COALESCE(SUM(amount), 0) AS total_amount_today
        FROM deposits
        WHERE status = 'completed'
          AND DATE(created_at) = CURDATE()
      `),
      pool.query(`
        SELECT COUNT(*) AS active_moderators
        FROM users
        WHERE role = 'moderator' AND is_blocked = 0 AND is_deleted = 0
      `),
    ]);

    const depRow = depositsToday?.[0] || {};
    const modRow = activeModerators?.[0] || {};

    res.json({
      total_deposits_today: Number(depRow.total_deposits_today || 0),
      total_amount_today: parseFloat(depRow.total_amount_today || 0),
      active_moderators: Number(modRow.active_moderators || 0),
    });
  } catch (error) {
    next(error);
  }
};

exports.getOperationsCockpit = async (req, res, next) => {
  try {
    const [pendingWithdrawals, pendingDeposits] = await Promise.all([
      pool.query(`
        SELECT wr.id, wr.user_id, wr.amount, wr.withdraw_method, wr.status, wr.created_at,
               u.name AS user_name, u.phone AS user_phone, u.moderator_id,
               moderator_user.name AS moderator_name
        FROM withdraw_requests wr
        JOIN users u ON u.id = wr.user_id
        LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
        WHERE wr.status = 'pending'
          AND wr.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY wr.created_at ASC
        LIMIT 6
      `),
      pool.query(`
        SELECT d.id, d.user_id, d.order_id, d.amount, d.status,
               d.gateway_txn_id, d.payment_method,
               d.failure_reason, d.created_at,
               u.name AS user_name, u.phone AS user_phone,
               COALESCE(d.payer_name, d.payer_vpa, u.name) AS payer_name
        FROM deposits d
        JOIN users u ON u.id = d.user_id
        WHERE d.status IN ('pending', 'failed')
          AND d.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY d.created_at ASC
        LIMIT 6
      `),
    ]);

    res.json({
      summary: {
        pending_withdrawals: pendingWithdrawals[0].length,
        pending_deposits: pendingDeposits[0].length,
      },
      queues: {
        pending_withdrawals: pendingWithdrawals[0],
        pending_deposits: pendingDeposits[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.globalSearch = async (req, res, next) => {
  try {
    const query = normalizeSearchTerm(req.query.q);
    if (query.length < 2) {
      return res.json({ query, sections: [] });
    }

    const pattern = buildSearchPattern(query);
    const exactNumber = /^\d+$/.test(query) ? Number(query) : null;

    const [users, moderators, deposits, withdrawals, bets, referrals] = await Promise.all([
      pool.query(
        `SELECT u.id, u.name, u.phone, u.referral_code, u.moderator_id, moderator_user.name AS moderator_name
         FROM users u
         LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
         WHERE u.role = 'user' AND u.is_deleted = 0
           AND (
             u.name LIKE ? ESCAPE '\\\\' OR
             u.phone LIKE ? ESCAPE '\\\\' OR
             u.referral_code LIKE ? ESCAPE '\\\\'${exactNumber ? ' OR u.id = ?' : ''}
           )
         ORDER BY u.created_at DESC
         LIMIT 6`,
        exactNumber ? [pattern, pattern, pattern, exactNumber] : [pattern, pattern, pattern]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT id, name, phone, referral_code
         FROM users
         WHERE role = 'moderator' AND is_deleted = 0
           AND (
             name LIKE ? ESCAPE '\\\\' OR
             phone LIKE ? ESCAPE '\\\\' OR
             referral_code LIKE ? ESCAPE '\\\\'${exactNumber ? ' OR id = ?' : ''}
           )
         ORDER BY created_at DESC
         LIMIT 6`,
        exactNumber ? [pattern, pattern, pattern, exactNumber] : [pattern, pattern, pattern]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT d.id, d.user_id, d.order_id, d.amount, d.utr_number, d.gateway_txn_id, d.created_at, u.name AS user_name, u.phone AS user_phone
         FROM deposits d
         JOIN users u ON u.id = d.user_id
         WHERE (d.utr_number LIKE ? ESCAPE '\\\\' OR d.order_id LIKE ? ESCAPE '\\\\' OR d.gateway_txn_id LIKE ? ESCAPE '\\\\')${exactNumber ? ' OR d.id = ?' : ''}
         ORDER BY d.created_at DESC
         LIMIT 6`,
        exactNumber ? [pattern, pattern, pattern, exactNumber] : [pattern, pattern, pattern]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT wr.id, wr.user_id, wr.amount, wr.status, wr.created_at, u.name AS user_name, u.phone AS user_phone
         FROM withdraw_requests wr
         JOIN users u ON u.id = wr.user_id
         WHERE ${exactNumber ? 'wr.id = ? OR ' : ''}(u.name LIKE ? ESCAPE '\\\\' OR u.phone LIKE ? ESCAPE '\\\\')
         ORDER BY wr.created_at DESC
         LIMIT 6`,
        exactNumber ? [exactNumber, pattern, pattern] : [pattern, pattern]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT b.id, b.user_id, b.total_amount, b.status, b.created_at, b.type,
                u.name AS user_name, u.phone AS user_phone, g.name AS game_name
         FROM bets b
         JOIN users u ON u.id = b.user_id
         JOIN games g ON g.id = b.game_id
         WHERE ${exactNumber ? 'b.id = ? OR ' : ''}(u.name LIKE ? ESCAPE '\\\\' OR u.phone LIKE ? ESCAPE '\\\\')
         ORDER BY b.created_at DESC
         LIMIT 6`,
        exactNumber ? [exactNumber, pattern, pattern] : [pattern, pattern]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT r.id, r.referrer_id, r.referred_user_id, r.bonus_amount, r.status, r.created_at,
                referrer.name AS referrer_name, referrer.role AS referrer_role,
                referred.name AS referred_name, referred.phone AS referred_phone
         FROM referrals r
         JOIN users referrer ON referrer.id = r.referrer_id
         JOIN users referred ON referred.id = r.referred_user_id
         WHERE ${exactNumber ? 'r.id = ? OR ' : ''}(
           referrer.name LIKE ? ESCAPE '\\\\' OR
           referrer.phone LIKE ? ESCAPE '\\\\' OR
           referred.name LIKE ? ESCAPE '\\\\' OR
           referred.phone LIKE ? ESCAPE '\\\\'
         )
         ORDER BY r.created_at DESC
         LIMIT 6`,
        exactNumber ? [exactNumber, pattern, pattern, pattern, pattern] : [pattern, pattern, pattern, pattern]
      ).then(([rows]) => rows),
    ]);

    const sections = [
      {
        key: 'users',
        label: 'Users',
        items: users.map((row) => ({
          id: `user-${row.id}`,
          title: row.name,
          subtitle: `ID: ${row.id} • ${row.phone} • Ref ${row.referral_code || '-'}`,
          meta: row.moderator_name ? `Moderator: ${row.moderator_name}` : 'No moderator',
          path: `/users/${row.id}`,
        })),
      },
      {
        key: 'moderators',
        label: 'Moderators',
        items: moderators.map((row) => ({
          id: `moderator-${row.id}`,
          title: row.name,
          subtitle: `${row.phone} • Ref ${row.referral_code || '-'}`,
          meta: `Moderator #${row.id}`,
          path: `/moderators/${row.id}`,
        })),
      },
      {
        key: 'deposits',
        label: 'Deposits / UTR',
        items: deposits.map((row) => ({
          id: `deposit-${row.id}`,
          title: `Deposit #${row.id}`,
          subtitle: `${row.user_name} • ${row.user_phone}`,
          meta: `UTR ${row.utr_number} • ₹${Number(row.amount || 0).toLocaleString('en-IN')}`,
          path: `/deposits?search=${encodeURIComponent(row.utr_number || row.id)}`,
        })),
      },
      {
        key: 'withdrawals',
        label: 'Withdrawals',
        items: withdrawals.map((row) => ({
          id: `withdraw-${row.id}`,
          title: `Withdrawal #${row.id}`,
          subtitle: `${row.user_name} • ${row.user_phone}`,
          meta: `₹${Number(row.amount || 0).toLocaleString('en-IN')} • ${row.status}`,
          path: `/withdrawals?search=${encodeURIComponent(row.id)}`,
        })),
      },
      {
        key: 'bets',
        label: 'Bets',
        items: bets.map((row) => ({
          id: `bet-${row.id}`,
          title: `Bet #${row.id}`,
          subtitle: `${row.user_name} • ${row.user_phone}`,
          meta: `${row.game_name} • ${row.type} • ₹${Number(row.total_amount || 0).toLocaleString('en-IN')}`,
          path: `/bets?search=${encodeURIComponent(row.id)}`,
        })),
      },
      {
        key: 'referrals',
        label: 'Referrals',
        items: referrals.map((row) => ({
          id: `referral-${row.id}`,
          title: `Referral #${row.id}`,
          subtitle: `${row.referrer_name} → ${row.referred_name}`,
          meta: `₹${Number(row.bonus_amount || 0).toLocaleString('en-IN')} • ${row.status}`,
          path: `/referrals?search=${encodeURIComponent(row.referred_phone || row.id)}`,
        })),
      },
    ].filter((section) => section.items.length > 0);

    res.json({ query, sections });
  } catch (error) {
    next(error);
  }
};

// ── Payout Rates ──────────────────────────────────────────────────────

const DEFAULT_PAYOUT_RATES = [
  { game_type: 'jodi', multiplier: 90 },
  { game_type: 'haruf_andar', multiplier: 9 },
  { game_type: 'haruf_bahar', multiplier: 9 },
  { game_type: 'crossing', multiplier: 90 },
];

exports.getPayoutRates = async (req, res, next) => {
  try {
    let [rates] = await pool.query(
      'SELECT id, game_type, multiplier, updated_at FROM game_payout_rates ORDER BY game_type'
    );
    if (rates.length === 0) {
      await pool.query(
        'INSERT IGNORE INTO game_payout_rates (game_type, multiplier) VALUES ?',
        [DEFAULT_PAYOUT_RATES.map(r => [r.game_type, r.multiplier])]
      );
      [rates] = await pool.query(
        'SELECT id, game_type, multiplier, updated_at FROM game_payout_rates ORDER BY game_type'
      );
    }
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
          'INSERT INTO game_payout_rates (game_type, multiplier, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE multiplier = VALUES(multiplier), updated_by = VALUES(updated_by), updated_at = NOW()',
          [game_type, mult, req.user.id]
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

const DEFAULT_BONUS_RATES = [
  { game_type: 'jodi', bonus_multiplier: 1 },
  { game_type: 'haruf_andar', bonus_multiplier: 1 },
  { game_type: 'haruf_bahar', bonus_multiplier: 1 },
  { game_type: 'crossing', bonus_multiplier: 1 },
];

exports.getBonusRates = async (req, res, next) => {
  try {
    let [rates] = await pool.query(
      'SELECT id, game_type, bonus_multiplier, updated_at FROM game_bonus_rates ORDER BY game_type'
    );
    if (rates.length === 0) {
      await pool.query(
        'INSERT IGNORE INTO game_bonus_rates (game_type, bonus_multiplier) VALUES ?',
        [DEFAULT_BONUS_RATES.map(r => [r.game_type, r.bonus_multiplier])]
      );
      [rates] = await pool.query(
        'SELECT id, game_type, bonus_multiplier, updated_at FROM game_bonus_rates ORDER BY game_type'
      );
    }
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
        if (!game_type || isNaN(mult) || mult < 1) {
          await conn.rollback();
          return res.status(400).json({ error: `Invalid bonus rate for "${game_type}". Must be >= 1.00 (1.00 = no bonus).` });
        }
        await conn.query(
          'INSERT INTO game_bonus_rates (game_type, bonus_multiplier, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE bonus_multiplier = VALUES(bonus_multiplier), updated_by = VALUES(updated_by), updated_at = NOW()',
          [game_type, mult, req.user.id]
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

// ── All Referrals (admin overview) ──────────────────────────────
exports.listReferrals = async (req, res, next) => {
  try {
    const { search, status, referrer_type } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let where = '1=1';
    const params = [];

    if (search) {
      where += ' AND (referrer.name LIKE ? OR referrer.phone LIKE ? OR referred.name LIKE ? OR referred.phone LIKE ?)';
      const escaped = `%${escapeLike(search)}%`;
      params.push(escaped, escaped, escaped, escaped);
    }
    if (status === 'pending' || status === 'credited') {
      where += ' AND r.status = ?';
      params.push(status);
    }
    if (referrer_type === 'moderator') {
      where += " AND referrer.role = 'moderator'";
    } else if (referrer_type === 'user') {
      where += " AND referrer.role = 'user'";
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM referrals r
      JOIN users referrer ON referrer.id = r.referrer_id
      JOIN users referred ON referred.id = r.referred_user_id
      WHERE ${where}
    `;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;

    const dataQuery = `
      SELECT r.id, r.bonus_amount, r.status, r.created_at, r.credited_at,
             referrer.id AS referrer_id, referrer.name AS referrer_name, referrer.phone AS referrer_phone, referrer.role AS referrer_role,
             referred.id AS referred_id, referred.name AS referred_name, referred.phone AS referred_phone
      FROM referrals r
      JOIN users referrer ON referrer.id = r.referrer_id
      JOIN users referred ON referred.id = r.referred_user_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [referrals] = await pool.query(dataQuery, [...params, limit, offset]);

    // Summary stats
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) AS total_referrals,
        SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN r.status = 'credited' THEN 1 ELSE 0 END) AS credited_count,
        COALESCE(SUM(r.bonus_amount), 0) AS total_bonus,
        COALESCE(SUM(CASE WHEN r.status = 'credited' THEN r.bonus_amount ELSE 0 END), 0) AS credited_bonus,
        COALESCE(SUM(CASE WHEN r.status = 'pending' THEN r.bonus_amount ELSE 0 END), 0) AS pending_bonus,
        COALESCE(SUM(CASE WHEN referrer.role = 'moderator' THEN r.bonus_amount ELSE 0 END), 0) AS moderator_bonus,
        COALESCE(SUM(CASE WHEN referrer.role = 'user' THEN r.bonus_amount ELSE 0 END), 0) AS user_bonus
      FROM referrals r
      JOIN users referrer ON referrer.id = r.referrer_id
    `);

    res.json({ referrals, total, page, limit, stats: stats[0] });
  } catch (error) {
    next(error);
  }
};

exports.getFinancialReport = async (req, res, next) => {
  try {
    const { from_date, to_date, game_id, moderator_id } = req.query;

    // Date filter clause builder
    const buildDateFilter = (tableAlias) => {
      let clause = '';
      const params = [];
      if (from_date) {
        clause += ` AND DATE(${tableAlias}.created_at) >= ?`;
        params.push(from_date);
      }
      if (to_date) {
        clause += ` AND DATE(${tableAlias}.created_at) <= ?`;
        params.push(to_date);
      }
      return { clause, params };
    };

    // Build filters
    const depositDate = buildDateFilter('d');
    const withdrawalDate = buildDateFilter('wr');
    const betDate = buildDateFilter('b');
    const bonusDate = buildDateFilter('bo');
    const bonusUsedDate = buildDateFilter('wt');

    // Moderator filter
    let moderatorFilter = '';
    const moderatorParams = [];
    if (moderator_id) {
      moderatorFilter = ' AND u.moderator_id = ?';
      moderatorParams.push(moderator_id);
    }

    // Game filter
    let gameFilter = '';
    const gameParams = [];
    if (game_id) {
      gameFilter = ' AND b.game_id = ?';
      gameParams.push(game_id);
    }

    // ===================== PLATFORM TOTALS =====================

    // Total Deposits (all)
    const [[platformDeposits]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(d.amount), 0) as total
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE d.status = 'completed'${depositDate.clause}${moderatorFilter}`,
      [...depositDate.params, ...moderatorParams]
    );

    // Admin Direct Deposits (users without moderator)
    const [[adminDirectDeposits]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(d.amount), 0) as total
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE d.status = 'completed' AND u.moderator_id IS NULL${depositDate.clause}`,
      [...depositDate.params]
    );

    // Moderator Deposits (users with moderator)
    const [[moderatorDeposits]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(d.amount), 0) as total
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE d.status = 'completed' AND u.moderator_id IS NOT NULL${depositDate.clause}${moderatorFilter}`,
      [...depositDate.params, ...moderatorParams]
    );

    // Total Withdrawals
    const [[platformWithdrawals]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(wr.amount), 0) as total
       FROM withdraw_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.status = 'approved'${withdrawalDate.clause}${moderatorFilter}`,
      [...withdrawalDate.params, ...moderatorParams]
    );

    // Admin Direct Withdrawals
    const [[adminDirectWithdrawals]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(wr.amount), 0) as total
       FROM withdraw_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.status = 'approved' AND u.moderator_id IS NULL${withdrawalDate.clause}`,
      [...withdrawalDate.params]
    );

    // Moderator Withdrawals
    const [[moderatorWithdrawals]] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(wr.amount), 0) as total
       FROM withdraw_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.status = 'approved' AND u.moderator_id IS NOT NULL${withdrawalDate.clause}${moderatorFilter}`,
      [...withdrawalDate.params, ...moderatorParams]
    );

    // Bonus Credited
    const [[platformBonusCredited]] = await pool.query(
      `SELECT COALESCE(SUM(bo.amount), 0) as total, COUNT(*) as count
       FROM bonuses bo
       JOIN users u ON u.id = bo.user_id
       WHERE 1=1${bonusDate.clause}${moderatorFilter}`,
      [...bonusDate.params, ...moderatorParams]
    );

    // Admin Direct Bonus
    const [[adminDirectBonus]] = await pool.query(
      `SELECT COALESCE(SUM(bo.amount), 0) as total, COUNT(*) as count
       FROM bonuses bo
       JOIN users u ON u.id = bo.user_id
       WHERE u.moderator_id IS NULL${bonusDate.clause}`,
      [...bonusDate.params]
    );

    // Moderator Bonus
    const [[moderatorBonus]] = await pool.query(
      `SELECT COALESCE(SUM(bo.amount), 0) as total, COUNT(*) as count
       FROM bonuses bo
       JOIN users u ON u.id = bo.user_id
       WHERE u.moderator_id IS NOT NULL${bonusDate.clause}${moderatorFilter}`,
      [...bonusDate.params, ...moderatorParams]
    );

    // Bonus Used in Bets
    const [[platformBonusUsed]] = await pool.query(
      `SELECT COALESCE(SUM(wt.amount), 0) as total, COUNT(*) as count
       FROM wallet_transactions wt
       JOIN users u ON u.id = wt.user_id
       WHERE wt.reference_type = 'bet_bonus'${bonusUsedDate.clause}${moderatorFilter}`,
      [...bonusUsedDate.params, ...moderatorParams]
    );

    // Bets (Gaming Activity)
    const [[platformBets]] = await pool.query(
      `SELECT COUNT(*) as count, 
        COALESCE(SUM(b.total_amount), 0) as total_stake, 
        COALESCE(SUM(b.win_amount), 0) as total_win,
        COALESCE(SUM(CASE WHEN b.status = 'win' THEN b.win_amount ELSE 0 END), 0) as total_payout,
        COALESCE(SUM(CASE WHEN b.status = 'loss' THEN b.total_amount ELSE 0 END), 0) as total_retained
       FROM bets b
       JOIN users u ON u.id = b.user_id
       WHERE 1=1${betDate.clause}${gameFilter}${moderatorFilter}`,
      [...betDate.params, ...gameParams, ...moderatorParams]
    );

    // ===================== MODERATOR DETAILED BREAKDOWN =====================

    const [moderatorStats] = await pool.query(
      `SELECT 
        m.id as moderator_id,
        m.name as moderator_name,
        (SELECT COUNT(*) FROM users WHERE role = 'user' AND moderator_id = m.id) as user_count,
        COALESCE((SELECT COUNT(*) FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.status = 'completed' AND u.moderator_id = m.id${depositDate.clause}), 0) as total_deposits,
        COALESCE((SELECT SUM(d.amount) FROM deposits d JOIN users u ON u.id = d.user_id WHERE d.status = 'completed' AND u.moderator_id = m.id${depositDate.clause}), 0) as total_deposit_amount,
        COALESCE((SELECT COUNT(*) FROM withdraw_requests wr JOIN users u ON u.id = wr.user_id WHERE wr.status = 'approved' AND u.moderator_id = m.id${withdrawalDate.clause}), 0) as total_withdrawals,
        COALESCE((SELECT SUM(wr.amount) FROM withdraw_requests wr JOIN users u ON u.id = wr.user_id WHERE wr.status = 'approved' AND u.moderator_id = m.id${withdrawalDate.clause}), 0) as total_withdrawal_amount,
        COALESCE((SELECT COUNT(*) FROM bonuses bo JOIN users u ON u.id = bo.user_id WHERE u.moderator_id = m.id${bonusDate.clause}), 0) as total_bonuses_given,
        COALESCE((SELECT SUM(bo.amount) FROM bonuses bo JOIN users u ON u.id = bo.user_id WHERE u.moderator_id = m.id${bonusDate.clause}), 0) as total_bonus_amount,
        COALESCE((SELECT COUNT(*) FROM bets b JOIN users u ON u.id = b.user_id WHERE u.moderator_id = m.id${betDate.clause}${gameFilter}), 0) as total_bets,
        COALESCE((SELECT SUM(b.total_amount) FROM bets b JOIN users u ON u.id = b.user_id WHERE u.moderator_id = m.id${betDate.clause}${gameFilter}), 0) as total_stake,
        COALESCE((SELECT SUM(b.win_amount) FROM bets b JOIN users u ON u.id = b.user_id WHERE u.moderator_id = m.id${betDate.clause}${gameFilter}), 0) as total_win,
        COALESCE((SELECT SUM(CASE WHEN b.status = 'loss' THEN b.total_amount ELSE 0 END) FROM bets b JOIN users u ON u.id = b.user_id WHERE u.moderator_id = m.id${betDate.clause}${gameFilter}), 0) as retained_stake
       FROM users m
       WHERE m.role = 'moderator' AND m.is_deleted = 0
       ORDER BY total_deposit_amount DESC`,
      [...depositDate.params, ...depositDate.params, ...withdrawalDate.params, ...withdrawalDate.params, ...bonusDate.params, ...bonusDate.params, ...betDate.params, ...gameParams, ...betDate.params, ...gameParams, ...betDate.params, ...gameParams, ...betDate.params, ...gameParams]
    );

    // Calculate comprehensive P&L for each moderator
    const moderatorsWithProfit = moderatorStats.map((mod) => {
      const depositAmount = Number(mod.total_deposit_amount || 0);
      const withdrawalAmount = Number(mod.total_withdrawal_amount || 0);
      const bonusAmount = Number(mod.total_bonus_amount || 0);
      const totalStake = Number(mod.total_stake || 0);
      const totalWin = Number(mod.total_win || 0);

      // Gaming P&L: Total stake placed minus total winnings paid out
      const gamingProfitLoss = totalStake - totalWin;

      // Net P&L: Gaming P&L minus bonuses credited
      const netProfitLoss = gamingProfitLoss - bonusAmount;

      return {
        ...mod,
        gaming_profit_loss: gamingProfitLoss,
        net_profit_loss: netProfitLoss,
        cash_in: depositAmount,
        cash_out: withdrawalAmount,
      };
    });

    // ===================== ADMIN DIRECT (UNASSIGNED USERS) BREAKDOWN =====================

    // Get stats for users not assigned to any moderator (direct admin users)
    const [[adminDirectUserCount]] = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE role = 'user' AND moderator_id IS NULL AND is_blocked = 0 AND COALESCE(is_deleted, 0) = 0`,
    );

    const [[adminDirectBetStats]] = await pool.query(
      `SELECT COUNT(*) as count,
        COALESCE(SUM(b.total_amount), 0) as total_stake,
        COALESCE(SUM(b.win_amount), 0) as total_win,
        COALESCE(SUM(CASE WHEN b.status = 'loss' THEN b.total_amount ELSE 0 END), 0) as retained_stake
       FROM bets b
       JOIN users u ON u.id = b.user_id
       WHERE u.moderator_id IS NULL${betDate.clause}${gameFilter}`,
      [...betDate.params, ...gameParams]
    );

    const adminDirectStake = Number(adminDirectBetStats.total_stake || 0);
    const adminDirectWin = Number(adminDirectBetStats.total_win || 0);
    const adminDirectGamingPnl = adminDirectStake - adminDirectWin;
    const adminDirectBonusAmt = Number(adminDirectBonus.total || 0);

    const adminDirectEntry = {
      moderator_id: 'admin',
      moderator_name: 'Admin (Unassigned Users)',
      user_count: adminDirectUserCount.count || 0,
      total_deposits: Number(adminDirectDeposits.count || 0),
      total_deposit_amount: Number(adminDirectDeposits.total || 0),
      total_withdrawals: Number(adminDirectWithdrawals.count || 0),
      total_withdrawal_amount: Number(adminDirectWithdrawals.total || 0),
      total_bonuses_given: Number(adminDirectBonus.count || 0),
      total_bonus_amount: adminDirectBonusAmt,
      total_bets: Number(adminDirectBetStats.count || 0),
      total_stake: adminDirectStake,
      total_win: adminDirectWin,
      retained_stake: Number(adminDirectBetStats.retained_stake || 0),
      gaming_profit_loss: adminDirectGamingPnl,
      net_profit_loss: adminDirectGamingPnl - adminDirectBonusAmt,
      cash_in: Number(adminDirectDeposits.total || 0),
      cash_out: Number(adminDirectWithdrawals.total || 0),
    };

    // Add admin entry to the beginning of the array
    moderatorsWithProfit.unshift(adminDirectEntry);

    // ===================== PLATFORM CALCULATIONS =====================

    const totalDeposits = Number(platformDeposits.total || 0);
    const totalWithdrawals = Number(platformWithdrawals.total || 0);
    const totalBonusCredited = Number(platformBonusCredited.total || 0);
    const totalBonusUsed = Number(platformBonusUsed.total || 0);
    const totalStake = Number(platformBets.total_stake || 0);
    const totalWin = Number(platformBets.total_win || 0);
    const totalRetained = Number(platformBets.total_retained || 0);

    // Gaming Revenue = Total Stake - Total Win Paid
    const gamingRevenue = totalStake - totalWin;

    // Platform Net = Gaming Revenue - Total Bonus Credited
    const platformNetProfit = gamingRevenue - totalBonusCredited;

    const platform = {
      // Deposits
      totalDeposits: Number(platformDeposits.count || 0),
      totalDepositAmount: totalDeposits,
      adminDirectDeposits: {
        count: Number(adminDirectDeposits.count || 0),
        amount: Number(adminDirectDeposits.total || 0),
      },
      moderatorDeposits: {
        count: Number(moderatorDeposits.count || 0),
        amount: Number(moderatorDeposits.total || 0),
      },

      // Withdrawals
      totalWithdrawals: Number(platformWithdrawals.count || 0),
      totalWithdrawalAmount: totalWithdrawals,
      adminDirectWithdrawals: {
        count: Number(adminDirectWithdrawals.count || 0),
        amount: Number(adminDirectWithdrawals.total || 0),
      },
      moderatorWithdrawals: {
        count: Number(moderatorWithdrawals.count || 0),
        amount: Number(moderatorWithdrawals.total || 0),
      },

      // Bonuses
      bonusCredited: totalBonusCredited,
      bonusCreditedCount: Number(platformBonusCredited.count || 0),
      adminDirectBonus: {
        amount: Number(adminDirectBonus.total || 0),
        count: Number(adminDirectBonus.count || 0),
      },
      moderatorBonus: {
        amount: Number(moderatorBonus.total || 0),
        count: Number(moderatorBonus.count || 0),
      },
      bonusUsed: totalBonusUsed,
      bonusUsedCount: Number(platformBonusUsed.count || 0),

      // Gaming
      totalBets: Number(platformBets.count || 0),
      totalStake: totalStake,
      totalWin: totalWin,
      totalRetained: totalRetained,
      gamingRevenue: gamingRevenue,

      // Overall P&L
      netProfitLoss: platformNetProfit,
    };

    res.json({ 
      platform, 
      moderators: moderatorsWithProfit 
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemAlerts = async (req, res, next) => {
  try {
    const { status = 'open', page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const whereClause = status === 'all' ? '' : 'WHERE status = ?';
    const params = status === 'all' ? [] : [status];

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM system_alerts ${whereClause}`, params);
    const [alerts] = await pool.query(
      `SELECT sa.*, u.name as resolved_by_name 
       FROM system_alerts sa
       LEFT JOIN users u ON u.id = sa.resolved_by
       ${whereClause}
       ORDER BY sa.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      alerts,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit, 10)),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.resolveSystemAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `UPDATE system_alerts 
       SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ? 
       WHERE id = ? AND status = 'open'`,
      [req.user.id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alert not found or already resolved.' });
    }

    res.json({ message: 'Alert marked as resolved.' });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    await connection.beginTransaction();
    
    // Manually delete records from tables that lack ON DELETE CASCADE
    await connection.query("DELETE FROM daily_bonus_claims WHERE user_id = ?", [id]);
    await connection.query("DELETE FROM support_messages WHERE sender_id = ?", [id]);
    await connection.query("DELETE FROM support_tickets WHERE user_id = ?", [id]);

    // Perform a complete hard delete instead of soft delete/block
    const [result] = await connection.query(
      "DELETE FROM users WHERE id = ? AND role = 'user'",
      [id]
    );

    await connection.commit();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await invalidateUserCache(id);

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};
