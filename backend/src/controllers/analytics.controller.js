const pool = require('../config/database');
const { IST_NOW_SQL, IST_DATE_SQL } = require('../utils/sql-time');

exports.getDashboard = async (req, res, next) => {
  try {
    const isModerator = req.user.role === 'moderator';
    const userScopeClause = isModerator ? ' AND moderator_id = ?' : '';
    const userScopeParams = isModerator ? [req.user.id] : [];
    const currentDayFilter = (column) => `${column} >= ${IST_DATE_SQL} AND ${column} < ${IST_DATE_SQL} + INTERVAL 1 DAY`;

    // Total users
    const [userCount] = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE role = 'user'${userScopeClause}`,
      userScopeParams
    );
    
    // Total deposits today
    const [depositsToday] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(d.amount), 0) as total
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       WHERE ${currentDayFilter('d.created_at')} AND d.status = 'approved'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
      userScopeParams
    );

    // Total withdrawals today
    const [withdrawalsToday] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(wr.amount), 0) as total
       FROM withdraw_requests wr
       JOIN users u ON wr.user_id = u.id
       WHERE ${currentDayFilter('wr.created_at')} AND wr.status = 'approved'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
      userScopeParams
    );

    // Total bets today
    const [betsToday] = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(b.total_amount), 0) as total
       FROM bets b
       JOIN users u ON b.user_id = u.id
       WHERE ${currentDayFilter('b.created_at')}${isModerator ? ' AND u.moderator_id = ?' : ''}`,
      userScopeParams
    );

    // Pending deposits
    const [pendingDeposits] = await pool.query(
      `SELECT COUNT(*) as count
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       WHERE d.status = 'pending'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
      userScopeParams
    );

    // Pending withdrawals
    const [pendingWithdrawals] = await pool.query(
      `SELECT COUNT(*) as count
       FROM withdraw_requests wr
       JOIN users u ON wr.user_id = u.id
       WHERE wr.status = 'pending'${isModerator ? ' AND u.moderator_id = ?' : ''}`,
      userScopeParams
    );

    // Total wallet balance
    const [totalBalance] = await pool.query(
      `SELECT COALESCE(SUM(w.balance), 0) as total
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       WHERE u.role = 'user'${userScopeClause}`,
      userScopeParams
    );

    // Recent activity
    const [recentBets] = await pool.query(
      `SELECT b.*, u.name as user_name, g.name as game_name
       FROM bets b
       JOIN users u ON b.user_id = u.id
       JOIN games g ON b.game_id = g.id
       WHERE 1 = 1${isModerator ? ' AND u.moderator_id = ?' : ''}
       ORDER BY b.created_at DESC LIMIT 10`,
      userScopeParams
    );

    res.json({
      stats: {
        total_users: userCount[0].count,
        deposits_today: { count: depositsToday[0].count, total: parseFloat(depositsToday[0].total) },
        withdrawals_today: { count: withdrawalsToday[0].count, total: parseFloat(withdrawalsToday[0].total) },
        bets_today: { count: betsToday[0].count, total: parseFloat(betsToday[0].total) },
        pending_deposits: pendingDeposits[0].count,
        pending_withdrawals: pendingWithdrawals[0].count,
        total_wallet_balance: parseFloat(totalBalance[0].total),
      },
      recent_bets: recentBets,
    });
  } catch (error) {
    next(error);
  }
};

exports.getBetAnalytics = async (req, res, next) => {
  try {
    const { game_id, type, from, to } = req.query;
    const isModerator = req.user.role === 'moderator';

    let query = `
      SELECT bn.number, SUM(bn.amount) as total_amount, COUNT(*) as bet_count
      FROM bet_numbers bn
      JOIN bets b ON bn.bet_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (isModerator) {
      query += ' AND u.moderator_id = ?';
      params.push(req.user.id);
    }

    if (game_id) {
      query += ' AND b.game_id = ?';
      params.push(game_id);
    }
    if (type) {
      query += ' AND b.type = ?';
      params.push(type);
    }
    if (from) {
      query += ' AND b.created_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND b.created_at <= ?';
      params.push(to + ' 23:59:59');
    }

    query += ' GROUP BY bn.number ORDER BY total_amount DESC';

    const [analytics] = await pool.query(query, params);

    // Find highest, lowest, and zero-bet numbers
    const highest = analytics.length > 0 ? analytics[0] : null;
    const lowest = analytics.length > 0 ? analytics[analytics.length - 1] : null;

    // All possible jodi numbers (00-99)
    const allNumbers = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
    const bettedNumbers = new Set(analytics.map(a => a.number));
    const noBetNumbers = allNumbers.filter(n => !bettedNumbers.has(n));

    res.json({
      analytics,
      summary: {
        highest_bet: highest,
        lowest_bet: lowest,
        no_bet_numbers: noBetNumbers,
        total_numbers_with_bets: analytics.length,
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getRevenueAnalytics = async (req, res, next) => {
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
      WHERE status = 'approved' AND created_at >= DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date
    `, [interval]);

    const [withdrawals] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(amount) as total
      FROM withdraw_requests
      WHERE status = 'approved' AND created_at >= DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date
    `, [interval]);

    const [bets] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(total_amount) as total_bet, SUM(win_amount) as total_win
      FROM bets
      WHERE created_at >= DATE_SUB(${IST_NOW_SQL}, INTERVAL ? DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY date
    `, [interval]);

    res.json({ deposits, withdrawals, bets, period });
  } catch (error) {
    next(error);
  }
};
