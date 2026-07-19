const pool = require('../config/database');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const { canPlaceBet, getResultDate } = require('../utils/game-time');
const { clampPagination, escapeLike } = require('../utils/pagination');
const fraudService = require('../services/fraud.service');

// Generate crossing combinations: digits A,B → "AB" and "BA" (if different)
function generateCrossingNumbers(digit1, digit2) {
  const d1 = digit1.toString();
  const d2 = digit2.toString();
  const nums = [`${d1}${d2}`];
  if (d1 !== d2) nums.push(`${d2}${d1}`);
  return nums;
}

function maskWinnerName(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'User****';
  if (safe.length <= 2) return `${safe.charAt(0)}****`;
  return `${safe.slice(0, Math.min(4, safe.length))}****`;
}

exports.placeBet = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { game_id, type, numbers, crossing_digits } = req.body;

    // Validate input
    if (!game_id || !type) {
      return res.status(400).json({ error: 'game_id and type are required.' });
    }

    const validTypes = ['jodi', 'haruf_andar', 'haruf_bahar', 'crossing'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid bet type.' });
    }

    // Build the final numbers array
    let betNumbers = [];

    if (type === 'crossing') {
      // Crossing: user provides two digits and an amount, we generate the jodi combinations
      if (crossing_digits) {
        const { digit1, digit2, amount } = crossing_digits;
        if (digit1 === undefined || digit2 === undefined || !amount || parseFloat(amount) <= 0) {
          return res.status(400).json({ error: 'crossing_digits requires digit1, digit2, and positive amount.' });
        }
        if (!/^\d$/.test(String(digit1)) || !/^\d$/.test(String(digit2))) {
          return res.status(400).json({ error: 'Crossing digits must be single digits (0-9).' });
        }
        const combos = generateCrossingNumbers(digit1, digit2);
        betNumbers = combos.map(n => ({ number: n, amount: parseFloat(amount) }));
      } else if (numbers && Array.isArray(numbers) && numbers.length > 0) {
        betNumbers = numbers;
      } else {
        return res.status(400).json({ error: 'Crossing bet requires crossing_digits or numbers array.' });
      }
    } else {
      if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'numbers array is required.' });
      }
      betNumbers = numbers;
    }

    // Validate number format per type
    for (const item of betNumbers) {
      if (item.number === undefined || item.number === null || !item.amount || parseFloat(item.amount) <= 0) {
        return res.status(400).json({ error: 'Each number must have a valid number and positive amount.' });
      }
      const numStr = String(item.number);
      if (type === 'jodi' || type === 'crossing') {
        if (!/^\d{2}$/.test(numStr)) {
          return res.status(400).json({ error: `${type} bet numbers must be 2-digit (00-99). Got: ${numStr}` });
        }
      } else if (type === 'haruf_andar' || type === 'haruf_bahar') {
        if (!/^\d$/.test(numStr)) {
          return res.status(400).json({ error: 'Haruf bet numbers must be single digit (0-9). Got: ' + numStr });
        }
      }
    }

    await conn.beginTransaction();

    // Check game exists and is active
    const [games] = await conn.query(
      'SELECT id, name, open_time, close_time, is_overnight, is_active FROM games WHERE id = ? AND is_active = 1',
      [game_id]
    );
    if (games.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Game not found or inactive.' });
    }

    const game = games[0];

    const now = new Date();

    // Compute session_date server-side: DATE(close_time) for the current session.
    // Never taken from the client — always derived from game timing.
    const session_date = getResultDate(game, now);

    // Check time-based betting constraints using the game-time utility
    const [settings] = await conn.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('max_bet_full','max_bet_30min','max_bet_last_30','max_bet_last_15','min_bet')"
    );
    const settingsMap = {};
    for (const s of settings) {
      settingsMap[s.setting_key] = parseFloat(s.setting_value);
    }

    const betCheck = canPlaceBet(game, settingsMap, now);
    if (!betCheck.allowed) {
      await conn.rollback();
      return res.status(400).json({ error: betCheck.reason });
    }

    const { maxBet, minBet, minutesLeft } = betCheck;
    const totalAmount = betNumbers.reduce((sum, n) => sum + parseFloat(n.amount), 0);

    // Validate each number amount
    for (const item of betNumbers) {
      if (parseFloat(item.amount) < minBet) {
        await conn.rollback();
        return res.status(400).json({ error: `Minimum bet per number is ₹${minBet}.` });
      }
      if (parseFloat(item.amount) > maxBet) {
        await conn.rollback();
        return res.status(400).json({ error: `Maximum bet per number is ₹${maxBet} (${Math.round(minutesLeft)} min before close).` });
      }
    }

    // Check wallet balance (balance + bonus_balance)
    // 10% of bet comes from bonus_balance, 90% from balance.
    // If bonus_balance is insufficient for 10%, use what's available and rest from balance.
    const [wallets] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ? FOR UPDATE', [req.user.id]);
    if (wallets.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Wallet not found.' });
    }

    const currentBalance = parseFloat(wallets[0].balance);
    const currentBonus = parseFloat(wallets[0].bonus_balance || 0);

    // Calculate bonus portion: 10% of bet, capped at available bonus
    const idealBonusPortion = Math.round(totalAmount * 0.10 * 100) / 100;
    const bonusUsed = Math.min(idealBonusPortion, currentBonus);
    const balanceUsed = Math.round((totalAmount - bonusUsed) * 100) / 100;

    if (currentBalance < balanceUsed) {
      await conn.rollback();
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    // Create bet
    const [betResult] = await conn.query(
      'INSERT INTO bets (user_id, game_id, type, total_amount, session_date) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, game_id, type, totalAmount, session_date]
    );

    const betId = betResult.insertId;

    // Bulk-insert all bet numbers in a single round-trip (was N sequential inserts).
    const betNumberRows = betNumbers.map((item) => [
      betId,
      String(item.number).padStart(type === 'jodi' || type === 'crossing' ? 2 : 1, '0'),
      parseFloat(item.amount),
    ]);
    await conn.query(
      'INSERT INTO bet_numbers (bet_id, number, amount) VALUES ?',
      [betNumberRows]
    );

    // Deduct bonus portion from bonus_balance and record in ledger
    if (bonusUsed > 0) {
      await conn.query('UPDATE wallets SET bonus_balance = bonus_balance - ? WHERE user_id = ?', [bonusUsed, req.user.id]);
      const [[bonusWallet]] = await conn.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [req.user.id]);
      const bonusBalanceAfter = parseFloat(bonusWallet.balance) + parseFloat(bonusWallet.bonus_balance);
      await conn.query(
        `INSERT INTO wallet_transactions
          (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
         VALUES (?, 'bet', ?, ?, 'completed', 'bet_bonus', ?, ?)`,
        [req.user.id, -bonusUsed, bonusBalanceAfter, `bet_bonus_${betId}`, `Bonus used for ${type} bet on ${game.name}`]
      );
    }

    const newBalance = await recordWalletTransaction(conn, {
      userId: req.user.id,
      type: 'bet',
      amount: -balanceUsed,
      referenceType: 'bet',
      referenceId: `bet_${betId}`,
      remark: `${type} bet on ${game.name}${bonusUsed > 0 ? ` (₹${bonusUsed} from bonus)` : ''}`,
    });

    await conn.commit();

    // Fire-and-forget fraud check — runs outside transaction, never blocks response
    fraudService.runChecks(req.user.id, totalAmount).catch(() => {});

    res.status(201).json({
      message: 'Bet placed successfully.',
      bet: { id: betId, game_id, type, total_amount: totalAmount, numbers: betNumbers.length },
      balance: newBalance,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.getUserBets = async (req, res, next) => {
  try {
    const { game_id, status, search, from_date, to_date } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let query = `
      SELECT b.*, g.name as game_name
      FROM bets b
      JOIN games g ON b.game_id = g.id
      WHERE b.user_id = ?
    `;
    const params = [req.user.id];

    if (game_id) {
      query += ' AND b.game_id = ?';
      params.push(game_id);
    }
    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }
    if (from_date) {
      query += ' AND COALESCE(b.session_date, DATE(b.created_at)) >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND COALESCE(b.session_date, DATE(b.created_at)) <= ?';
      params.push(to_date);
    }
    if (search) {
      const escaped = escapeLike(search);
      query += `
        AND (
          g.name LIKE ?
          OR b.type LIKE ?
          OR EXISTS (
            SELECT 1
            FROM bet_numbers bn_search
            WHERE bn_search.bet_id = b.id
              AND bn_search.number LIKE ?
          )
        )
      `;
      params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const summaryQuery = `SELECT COUNT(*) as totalBets, COALESCE(SUM(total_amount),0) as totalStake, COALESCE(SUM(win_amount),0) as totalWin FROM (${query}) as summaryTable`;
    const [countResult, summaryResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(summaryQuery, params),
    ]);

    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [bets] = await pool.query(query, params);

    // Batch-load bet numbers (avoids N+1 query)
    if (bets.length > 0) {
      const betIds = bets.map(b => b.id);
      const [allNums] = await pool.query(
        'SELECT bet_id, number, amount FROM bet_numbers WHERE bet_id IN (?)',
        [betIds]
      );
      const numsByBet = {};
      for (const n of allNums) {
        if (!numsByBet[n.bet_id]) numsByBet[n.bet_id] = [];
        numsByBet[n.bet_id].push({ number: n.number, amount: n.amount });
      }
      for (const bet of bets) {
        bet.numbers = numsByBet[bet.id] || [];
      }
    }

    res.json({
      bets,
      summary: {
        totalBets: Number(summaryResult[0][0].totalBets),
        totalStake: Number(summaryResult[0][0].totalStake),
        totalWin: Number(summaryResult[0][0].totalWin),
      },
      pagination: {
        page,
        limit,
        total: countResult[0][0].total,
        totalPages: Math.ceil(countResult[0][0].total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllBets = async (req, res, next) => {
  try {
    const { game_id, status, search, from_date, to_date, moderator_id } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    const baseJoins = `
      FROM bets b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
      JOIN games g ON g.id = b.game_id
      LEFT JOIN game_results gr_linked ON gr_linked.id = b.game_result_id
      LEFT JOIN game_results gr_session
        ON gr_session.game_id = b.game_id
       AND gr_session.result_date = COALESCE(b.session_date, DATE(b.created_at))
    `;

    let filters = ' WHERE 1 = 1';
    const params = [];

    if (req.user.role === 'moderator') {
      filters += ' AND u.moderator_id = ?';
      params.push(req.user.id);
    } else if (moderator_id) {
      filters += ' AND u.moderator_id = ?';
      params.push(moderator_id);
    }

    if (game_id) {
      filters += ' AND b.game_id = ?';
      params.push(game_id);
    }

    if (status) {
      filters += ' AND b.status = ?';
      params.push(status);
    }

    if (from_date) {
      filters += ' AND COALESCE(b.session_date, DATE(b.created_at)) >= ?';
      params.push(from_date);
    }

    if (to_date) {
      filters += ' AND COALESCE(b.session_date, DATE(b.created_at)) <= ?';
      params.push(to_date);
    }

    if (search) {
      const escaped = escapeLike(search);
      filters += `
        AND (
          CAST(b.id AS CHAR) LIKE ?
          OR
          u.name LIKE ?
          OR u.phone LIKE ?
          OR g.name LIKE ?
          OR b.type LIKE ?
          OR COALESCE(gr_linked.result_number, gr_session.result_number) LIKE ?
          OR EXISTS (
            SELECT 1
            FROM bet_numbers bn_search
            WHERE bn_search.bet_id = b.id
              AND bn_search.number LIKE ?
          )
        )
      `;
      params.push(
        `%${escaped}%`,
        `%${escaped}%`,
        `%${escaped}%`,
        `%${escaped}%`,
        `%${escaped}%`,
        `%${escaped}%`,
        `%${escaped}%`
      );
    }

    const countQuery = `SELECT COUNT(*) as total ${baseJoins} ${filters}`;
    const summaryQuery = `
      SELECT
        COUNT(*) as totalBets,
        COALESCE(SUM(b.total_amount), 0) as totalStake,
        COALESCE(SUM(b.win_amount), 0) as totalWin,
        COALESCE(SUM(b.win_amount - b.total_amount), 0) as netProfitLoss
      ${baseJoins} ${filters}
    `;

    const dataQuery = `
      SELECT
        b.id,
        b.user_id,
        b.game_id,
        b.type,
        b.total_amount,
        b.win_amount,
        b.status,
        b.created_at,
        b.updated_at,
        DATE_FORMAT(COALESCE(b.session_date, DATE(b.created_at)), '%Y-%m-%d') as session_date,
        u.name AS user_name,
        u.phone AS user_phone,
        u.moderator_id,
        moderator_user.name AS moderator_name,
        g.name AS game_name,
        COALESCE(gr_linked.result_number, gr_session.result_number) AS result_number,
        DATE_FORMAT(COALESCE(gr_linked.result_date, gr_session.result_date), '%Y-%m-%d') AS result_date,
        GROUP_CONCAT(CONCAT(bn.number, ' (₹', FORMAT(bn.amount, 2), ')') ORDER BY bn.id SEPARATOR ', ') AS bet_numbers
      ${baseJoins}
      LEFT JOIN bet_numbers bn ON bn.bet_id = b.id
      ${filters}
      GROUP BY
        b.id,
        b.user_id,
        b.game_id,
        b.type,
        b.total_amount,
        b.win_amount,
        b.status,
        b.created_at,
        b.updated_at,
        b.session_date,
        u.name,
        u.phone,
        u.moderator_id,
        moderator_user.name,
        g.name,
        gr_linked.result_number,
        gr_linked.result_date,
        gr_session.result_number,
        gr_session.result_date
      ORDER BY COALESCE(b.session_date, DATE(b.created_at)) DESC, b.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countResult, summaryResult, betsResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(summaryQuery, params),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    const summaryRow = summaryResult[0][0] || {};

    const bets = (betsResult[0] || []).map((bet) => ({
      ...bet,
      total_amount: Number(bet.total_amount || 0),
      win_amount: Number(bet.win_amount || 0),
      profit_loss: Number((Number(bet.win_amount || 0) - Number(bet.total_amount || 0)).toFixed(2)),
      loss_amount: Math.max(Number((Number(bet.total_amount || 0) - Number(bet.win_amount || 0)).toFixed(2)), 0),
    }));

    res.json({
      bets,
      summary: {
        totalBets: Number(summaryRow.totalBets || 0),
        totalStake: Number(summaryRow.totalStake || 0),
        totalWin: Number(summaryRow.totalWin || 0),
        netProfitLoss: Number(summaryRow.netProfitLoss || 0),
      },
      pagination: {
        page,
        limit,
        total: Number(countResult[0][0]?.total || 0),
        totalPages: Math.ceil(Number(countResult[0][0]?.total || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getRecentWinners = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
    const [rows] = await pool.query(
      `SELECT b.id,
              b.user_id,
              u.name,
              g.name AS game_name,
              b.win_amount,
              b.type,
              b.created_at
       FROM bets b
       JOIN users u ON u.id = b.user_id
       JOIN games g ON g.id = b.game_id
       WHERE b.status = 'win'
         AND b.win_amount > 0
       ORDER BY b.updated_at DESC, b.id DESC
       LIMIT ?`,
      [limit]
    );

    const winners = rows.map((row) => ({
      bet_id: row.id,
      user_id: row.user_id,
      user_name: maskWinnerName(row.name),
      game_name: row.game_name,
      type: row.type,
      win_amount: parseFloat(row.win_amount || 0),
      created_at: row.created_at,
    }));

    res.json({ winners });
  } catch (error) {
    next(error);
  }
};
