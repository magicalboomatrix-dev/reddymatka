const pool = require('../config/database');
const { settleBetsForGame, reverseSettlement } = require('../utils/settle-bets');
const { enqueueSettlement } = require('../utils/auto-settle');
const eventBus = require('../utils/event-bus');
const redis = require('../services/redis.service');
const {
  isOvernightGame,
  getResultDate,
  isResultVisible,
  canSettleGame,
} = require('../utils/game-time');

exports.listGames = async (req, res, next) => {
  try {
    const [games] = await pool.query(`
      SELECT g.*,
             COALESCE(pb.pending_bets_count, 0) AS pending_bets_count
      FROM games g
      LEFT JOIN (
        SELECT game_id, COUNT(*) AS pending_bets_count
        FROM bets
        WHERE status = 'pending'
        GROUP BY game_id
      ) pb ON pb.game_id = g.id
      ORDER BY g.is_active DESC, g.open_time
    `);

    // Fetch pending bets grouped by session date for each game
    const gameIds = games.map(g => g.id);
    let pendingByDate = [];
    if (gameIds.length > 0) {
      const [rows] = await pool.query(`
        SELECT game_id, session_date, COUNT(*) as count
        FROM bets
        WHERE status = 'pending' AND game_id IN (?)
        GROUP BY game_id, session_date
        ORDER BY session_date DESC
      `, [gameIds]);
      pendingByDate = rows;
    }

    // Group pending bets by game_id
    const pendingByGame = {};
    for (const row of pendingByDate) {
      if (!pendingByGame[row.game_id]) {
        pendingByGame[row.game_id] = [];
      }
      pendingByGame[row.game_id].push({
        session_date: row.session_date,
        count: row.count
      });
    }

    const now = new Date();

    // For each game, compute the current session's result_date (= close date).
    const gameDateMap = games.map((g) => ({
      id: g.id,
      currentSessionDate: getResultDate(g, now),
    }));

    // Single batch query for current session results
    let batchResults = [];
    if (games.length > 0) {
      const gameIds = gameDateMap.map((d) => d.id);
      const allDates = [...new Set(gameDateMap.map((d) => d.currentSessionDate))];
      const [rows] = await pool.query(
        `SELECT game_id, result_number, DATE_FORMAT(result_date, '%Y-%m-%d') AS result_date,
                declared_at, is_settled
         FROM game_results
         WHERE game_id IN (?) AND result_date IN (?) AND declared_at IS NOT NULL`,
        [gameIds, allDates]
      );
      batchResults = rows;
    }

    // Also fetch the most recent declared result per game (for showing last result if current session has none)
    let recentResults = [];
    if (games.length > 0) {
      const gameIds = gameDateMap.map((d) => d.id);
      const [rows] = await pool.query(
        `SELECT gr.game_id, gr.result_number, DATE_FORMAT(gr.result_date, '%Y-%m-%d') AS result_date,
                gr.declared_at, gr.is_settled
         FROM game_results gr
         INNER JOIN (
           SELECT game_id, MAX(result_date) AS max_date
           FROM game_results
           WHERE game_id IN (?) AND declared_at IS NOT NULL
           GROUP BY game_id
         ) latest ON gr.game_id = latest.game_id AND gr.result_date = latest.max_date
         WHERE gr.game_id IN (?) AND gr.declared_at IS NOT NULL`,
        [gameIds, gameIds]
      );
      recentResults = rows;
    }

    // Build lookup maps
    const resultMap = {};
    for (const row of batchResults) {
      const key = `${row.game_id}:${row.result_date}`;
      if (!resultMap[key]) resultMap[key] = row;
    }

    const recentMap = {};
    for (const row of recentResults) {
      if (!recentMap[row.game_id]) recentMap[row.game_id] = row;
    }

    for (const g of games) {
      const { currentSessionDate } = gameDateMap.find((d) => d.id === g.id);

      const currentResult = resultMap[`${g.id}:${currentSessionDate}`] || null;
      const lastResult = recentMap[g.id] || null;

      // Current session info
      g.result_number = currentResult ? currentResult.result_number : null;
      g.result_date = currentResult ? currentResult.result_date : currentSessionDate;
      g.declared_at = currentResult ? currentResult.declared_at : null;
      g.is_result_settled = currentResult ? !!currentResult.is_settled : null;
      g.result_visible = currentResult ? isResultVisible(g, currentSessionDate, now) : false;
      g.current_session_date = currentSessionDate;

      // Last declared result (may be from a prior session)
      g.last_result_number = lastResult ? lastResult.result_number : null;
      g.last_result_date = lastResult ? lastResult.result_date : null;
      g.is_last_result_settled = lastResult ? !!lastResult.is_settled : null;

      g.is_overnight = isOvernightGame(g);

      // Add pending bets grouped by session date
      g.pending_by_date = pendingByGame[g.id] || [];
    }

    res.json({ games, server_now: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};

exports.getGameInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [games] = await pool.query('SELECT * FROM games WHERE id = ?', [id]);
    if (games.length === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    // Get the most recent result history using declaration timestamps.
    const [results] = await pool.query(`
      SELECT result_number, result_date, declared_at
      FROM game_results
      WHERE game_id = ?
        AND declared_at IS NOT NULL
      ORDER BY declared_at DESC
      LIMIT 10
    `, [id]);

    res.json({ game: games[0], results, server_now: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};

exports.createGame = async (req, res, next) => {
  try {
    const { name, open_time, close_time } = req.body;
    if (!name || !open_time || !close_time) {
      return res.status(400).json({ error: 'Name, open_time, and close_time are required.' });
    }

    const overnight = isOvernightGame({ open_time, close_time }) ? 1 : 0;

    const [result] = await pool.query(
      'INSERT INTO games (name, open_time, close_time, result_time, is_overnight) VALUES (?, ?, ?, ?, ?)',
      [name, open_time, close_time, close_time, overnight]
    );

    res.status(201).json({ message: 'Game created.', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Game already exists — try a different name.' });
    }
    next(error);
  }
};

exports.updateGame = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, open_time, close_time, is_active } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (open_time !== undefined) { fields.push('open_time = ?'); values.push(open_time); }
    if (close_time !== undefined) {
      fields.push('close_time = ?');
      values.push(close_time);
      fields.push('result_time = ?');
      values.push(close_time);
    }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }

    // Recalculate is_overnight if either time changed
    if (open_time !== undefined || close_time !== undefined) {
      // Fetch current times to merge with updates
      const [current] = await pool.query('SELECT open_time, close_time FROM games WHERE id = ?', [id]);
      if (current.length > 0) {
        const effectiveOpen = open_time !== undefined ? open_time : current[0].open_time;
        const effectiveClose = close_time !== undefined ? close_time : current[0].close_time;
        const overnight = isOvernightGame({ open_time: effectiveOpen, close_time: effectiveClose }) ? 1 : 0;
        fields.push('is_overnight = ?');
        values.push(overnight);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(id);
    await pool.query(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`, values);

    redis.delPattern('cache:/api/games*').catch(() => {});

    res.json({ message: 'Game updated.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Game already exists — try a different name.' });
    }
    next(error);
  }
};

exports.deleteGame = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id FROM games WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    await pool.query('DELETE FROM games WHERE id = ?', [id]);
    res.json({ message: 'Game deleted.' });
  } catch (error) {
    next(error);
  }
};

exports.declareResult = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { result_number, result_date: adminDate } = req.body;

    if (!result_number) {
      return res.status(400).json({ error: 'Result number is required.' });
    }

    if (!adminDate || !/^\d{4}-\d{2}-\d{2}$/.test(adminDate)) {
      return res.status(400).json({ error: 'A valid result_date (YYYY-MM-DD) is required.' });
    }

    // Validate result_number is a 2-digit number (00-99)
    const resultStr = result_number.toString().padStart(2, '0');
    if (!/^\d{2}$/.test(resultStr)) {
      return res.status(400).json({ error: 'Result number must be a 2-digit number (00-99).' });
    }

    const [gameRows] = await conn.query('SELECT * FROM games WHERE id = ?', [id]);
    if (gameRows.length === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    const game = gameRows[0];
    const now = new Date();

    // CORE RULE: result_date comes from the admin's selection — never computed from "now".
    // This ensures late declarations still land on the correct session.
    const result_date = adminDate;

    // Use game-time utilities to determine if settlement can proceed
    const settleAllowed = canSettleGame(game, result_date, now);

    await conn.beginTransaction();

    // Insert or update result — declared_at = actual current time
    const [existing] = await conn.query(
      'SELECT id, is_settled, result_number FROM game_results WHERE game_id = ? AND result_date = ?',
      [id, result_date]
    );

    let resultId;
    if (existing.length > 0) {
      resultId = existing[0].id;
      const isRevision = existing[0].is_settled && existing[0].result_number !== resultStr;

      if (isRevision) {
        await reverseSettlement(conn, resultId);
        await conn.query('DELETE FROM settlement_queue WHERE game_result_id = ?', [resultId]);
      } else if (existing[0].is_settled) {
        await conn.rollback();
        return res.status(409).json({ error: 'Result already settled with the same number.' });
      }

      await conn.query(
        'UPDATE game_results SET result_number = ?, declared_at = NOW(), is_settled = 0 WHERE id = ?',
        [resultStr, resultId]
      );
    } else {
      const [ins] = await conn.query(
        'INSERT INTO game_results (game_id, result_number, result_date, declared_at) VALUES (?, ?, ?, NOW())',
        [id, resultStr, result_date]
      );
      resultId = ins.insertId;
    }

    // Only settle bets if the game's close_datetime has passed
    let settledCount = 0;
    if (settleAllowed) {
      // Lock the result row to prevent concurrent settlement
      const [locked] = await conn.query(
        'SELECT id FROM game_results WHERE id = ? AND is_settled = 0 FOR UPDATE',
        [resultId]
      );
      if (locked.length > 0) {
        settledCount = await settleBetsForGame(conn, id, resultStr, resultId, game, result_date);
        await conn.query('UPDATE game_results SET is_settled = 1 WHERE id = ?', [resultId]);
        // Record completed queue entry so worker skips it
        await enqueueSettlement(conn, {
          gameResultId: resultId,
          gameId: parseInt(id),
          resultNumber: resultStr,
          resultDate: result_date,
        });
        await conn.query(
          `UPDATE settlement_queue SET status = 'done', completed_at = NOW() WHERE game_result_id = ?`,
          [resultId]
        );
      }
    } else {
      // Close time hasn't passed yet — enqueue for the worker to pick up later
      await enqueueSettlement(conn, {
        gameResultId: resultId,
        gameId: parseInt(id),
        resultNumber: resultStr,
        resultDate: result_date,
      });
    }

    await conn.commit();

    // Invalidate cached game list and monthly results so clients see the new result immediately
    redis.delPattern('cache:/api/games*').catch(() => {});
    redis.delPattern('cache:/api/results*').catch(() => {});

    // Notify subscribers that a result was declared (fire-and-forget, outside tx)
    eventBus.emit('result_declared', {
      gameId: parseInt(id),
      resultId,
      resultDate: result_date,
      resultNumber: resultStr,
    });

    const message = settleAllowed
      ? `Result declared and ${settledCount} bet(s) settled.`
      : 'Result saved. Bets will auto-settle after close time.';
    res.json({ message, resultId, result_date, settledCount });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

// Manual settle endpoint — settles pending bets for a game using the most recent declared result
exports.settleBets = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    const [games] = await conn.query('SELECT * FROM games WHERE id = ?', [id]);
    if (games.length === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    const game = games[0];
    const now = new Date();

    // Find all unsettled results for this game and settle them.
    // This avoids the fragile "compute result_date from now" approach —
    // we simply look for any declared-but-unsettled results directly.
    await conn.beginTransaction();
    let settledCount = 0;
    let missingResultDates = 0;

    const [unsettledResults] = await conn.query(
      `SELECT id, result_number, DATE_FORMAT(result_date, '%Y-%m-%d') AS result_date
       FROM game_results
       WHERE game_id = ? AND is_settled = 0 AND declared_at IS NOT NULL
       ORDER BY result_date DESC
       LIMIT 5`,
      [id]
    );

    if (unsettledResults.length === 0) {
      // Check if there are pending bets with no result at all
      const [[{ cnt }]] = await conn.query(
        "SELECT COUNT(*) as cnt FROM bets WHERE game_id = ? AND status = 'pending'",
        [id]
      );
      if (cnt > 0) missingResultDates++;
    }

    for (const result of unsettledResults) {
      const checkDate = result.result_date;

      // Check if close_datetime has passed for this date
      if (!canSettleGame(game, checkDate, now)) {
        continue;
      }

      const resultId = result.id;
      const resultStr = result.result_number.toString().padStart(2, '0');

      // Lock the result row to prevent concurrent settlement
      const [locked] = await conn.query(
        'SELECT id FROM game_results WHERE id = ? AND is_settled = 0 FOR UPDATE',
        [resultId]
      );
      if (locked.length === 0) continue;

      const count = await settleBetsForGame(conn, id, resultStr, resultId, game, checkDate);
      await conn.query('UPDATE game_results SET is_settled = 1 WHERE id = ?', [resultId]);

      // Record in queue as done
      await enqueueSettlement(conn, {
        gameResultId: resultId,
        gameId: parseInt(id),
        resultNumber: resultStr,
        resultDate: checkDate,
      });
      await conn.query(
        `UPDATE settlement_queue SET status = 'done', completed_at = NOW() WHERE game_result_id = ?`,
        [resultId]
      );

      settledCount += count;
    }

    await conn.commit();

    if (settledCount === 0 && missingResultDates > 0) {
      return res.status(400).json({
        error: 'No matching declared result found for pending bet date(s). Declare results for those dates first.'
      });
    }

    res.json({ message: `Settled ${settledCount} bets.`, settledCount });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

// Get pending bets for a game, optionally filtered by session date
exports.getPendingBets = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { session_date } = req.query;

    const [games] = await pool.query('SELECT * FROM games WHERE id = ?', [id]);
    if (games.length === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    let query = `
      SELECT b.id, b.user_id, b.type, b.total_amount, b.session_date, b.created_at,
             u.name as user_name, u.phone as user_phone,
             GROUP_CONCAT(CONCAT(bn.number, ':', bn.amount) SEPARATOR ', ') as numbers
      FROM bets b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN bet_numbers bn ON bn.bet_id = b.id
      WHERE b.game_id = ? AND b.status = 'pending'
    `;
    const params = [id];

    if (session_date) {
      query += ' AND b.session_date = ?';
      params.push(session_date);
    }

    query += ' GROUP BY b.id ORDER BY b.session_date DESC, b.created_at DESC';

    const [bets] = await pool.query(query, params);

    // Also get summary by date
    const [summary] = await pool.query(`
      SELECT session_date, COUNT(*) as count, SUM(total_amount) as total_amount
      FROM bets
      WHERE game_id = ? AND status = 'pending'
      GROUP BY session_date
      ORDER BY session_date DESC
    `, [id]);

    res.json({
      game: games[0],
      bets,
      summary,
      filtered_by_date: session_date || null
    });
  } catch (error) {
    next(error);
  }
};
