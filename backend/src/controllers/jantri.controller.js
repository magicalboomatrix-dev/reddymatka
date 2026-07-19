const pool = require('../config/database');
const { IST_DATE_SQL } = require('../utils/sql-time');

function getModeratorScope(req) {
  if (req.user.role === 'moderator') {
    return {
      clause: ' AND u.moderator_id = ?',
      params: [req.user.id],
    };
  }

  if (req.user.role === 'admin' && req.query.moderator_id) {
    return {
      clause: ' AND u.moderator_id = ?',
      params: [req.query.moderator_id],
    };
  }

  return {
    clause: '',
    params: [],
  };
}

exports.getJantri = async (req, res, next) => {
  try {
    const { game_id, type, date } = req.query;
    const params = [];
    const moderatorScope = getModeratorScope(req);

    let dateFilter = `COALESCE(b.session_date, DATE(b.created_at)) = ${IST_DATE_SQL}`;
    if (date) {
      dateFilter = 'COALESCE(b.session_date, DATE(b.created_at)) = ?';
      params.push(date);
    }

    params.push(...moderatorScope.params);

    let query = `
      SELECT bn.number, b.type, SUM(bn.amount) AS total_amount, COUNT(*) AS bet_count
      FROM bet_numbers bn
      JOIN bets b ON bn.bet_id = b.id
      JOIN users u ON b.user_id = u.id
      WHERE ${dateFilter}${moderatorScope.clause}
    `;

    if (game_id) {
      query += ' AND b.game_id = ?';
      params.push(game_id);
    }

    if (type) {
      query += ' AND b.type = ?';
      params.push(type);
    }

    query += ' GROUP BY bn.number, b.type ORDER BY total_amount DESC, bn.number ASC';

    const [entries] = await pool.query(query, params);

    const jodiItems = entries.filter((item) => /^\d{2}$/.test(String(item.number)));
    const allNumbers = Array.from({ length: 100 }, (_, index) => index.toString().padStart(2, '0'));
    const bettedNumbers = new Set(jodiItems.map((item) => String(item.number).padStart(2, '0')));
    const noBetNumbers = allNumbers.filter((number) => !bettedNumbers.has(number));

    const totalAmount = entries.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
    const totalBetCount = entries.reduce((sum, item) => sum + (Number(item.bet_count) || 0), 0);

    res.json({
      entries,
      summary: {
        total_amount: totalAmount,
        total_bet_count: totalBetCount,
        total_numbers_with_bets: entries.length,
        total_jodi_numbers_with_bets: jodiItems.length,
        no_bet_numbers: noBetNumbers,
        highest_bet: entries[0] || null,
      },
      filters: {
        date: date || null,
        game_id: game_id || null,
        type: type || null,
        moderator_id: req.user.role === 'admin' ? (req.query.moderator_id || null) : req.user.id,
      },
    });
  } catch (error) {
    next(error);
  }
};