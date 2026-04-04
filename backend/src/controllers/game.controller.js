const pool = require('../config/database');
const { settleBetsForGame } = require('../utils/settle-bets');
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
      WHERE g.is_active = 1
      ORDER BY g.open_time
    `);

    const now = new Date();
    const priorNow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Compute required result dates for every game (no DB queries yet)
    const gameDateMap = games.map((g) => ({
      id: g.id,
      today: getResultDate(g, now),
      yesterday: getResultDate(g, priorNow),
    }));

    // Single batch query instead of 2×N individual queries
    let batchResults = [];
    if (games.length > 0) {
      const gameIds = gameDateMap.map((d) => d.id);
      const allDates = [...new Set(gameDateMap.flatMap((d) => [d.today, d.yesterday]))];
      const [rows] = await pool.query(
        `SELECT game_id, result_number, DATE_FORMAT(result_date, '%Y-%m-%d') AS result_date,
                declared_at, is_settled
         FROM game_results
         WHERE game_id IN (?) AND result_date IN (?) AND declared_at IS NOT NULL`,
        [gameIds, allDates]
      );
      batchResults = rows;
    }

    // Build lookup map: "gameId:YYYY-MM-DD" → first matching result row
    const resultMap = {};
    for (const row of batchResults) {
      const key = `${row.game_id}:${row.result_date}`;
      if (!resultMap[key]) resultMap[key] = row;
    }

    for (const g of games) {
      const { today: resultDateToday, yesterday: resultDateYesterday } =
        gameDateMap.find((d) => d.id === g.id);

      const todayResult = resultMap[`${g.id}:${resultDateToday}`] || null;
      const yesterdayResult = resultMap[`${g.id}:${resultDateYesterday}`] || null;

      g.result_number = todayResult ? todayResult.result_number : null;
      g.result_date = todayResult ? todayResult.result_date : null;
      g.declared_at = todayResult ? todayResult.declared_at : null;
      g.is_result_settled = todayResult ? !!todayResult.is_settled : null;
      g.result_visible = todayResult ? isResultVisible(g, resultDateToday, now) : false;

      g.yesterday_result_number = yesterdayResult ? yesterdayResult.result_number : null;
      g.yesterday_result_date = yesterdayResult ? yesterdayResult.result_date : null;
      g.is_yesterday_result_settled = yesterdayResult ? !!yesterdayResult.is_settled : null;

      g.is_overnight = isOvernightGame(g);
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
    const { result_number } = req.body;

    if (!result_number) {
      return res.status(400).json({ error: 'Result number is required.' });
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

    // Auto-compute result_date = DATE(close_time) for the current session.
    // Never trust the client for this — it must always be derived from game timing.
    const result_date = getResultDate(game, now);

    // Use game-time utilities to determine if settlement can proceed
    const settleAllowed = canSettleGame(game, result_date, now);

    await conn.beginTransaction();

    // Insert or update result — declared_at = actual current time
    const [existing] = await conn.query(
      'SELECT id, is_settled FROM game_results WHERE game_id = ? AND result_date = ?',
      [id, result_date]
    );

    let resultId;
    if (existing.length > 0) {
      resultId = existing[0].id;
      // Allow re-declaration only if not yet settled
      if (existing[0].is_settled) {
        await conn.rollback();
        return res.status(409).json({ error: 'Result already settled. Cannot re-declare.' });
      }
      await conn.query(
        'UPDATE game_results SET result_number = ?, declared_at = NOW() WHERE id = ?',
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

    // Current session result_date = DATE(close_time) for right now.
    const resultDateStr = getResultDate(game, now);

    // Prior session result_date = what getResultDate returns 24 h ago.
    // Using a 24 h shift handles overnight games correctly: an overnight game
    // that closes at 05:30 will, when queried at 20:00, give tomorrow as the
    // current session; going back 24 h gives today, which is the prior session.
    const priorNow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const priorDateStr = getResultDate(game, priorNow);

    // Deduplicate in case both resolve to the same date (normal same-day games).
    const datesToCheck = [...new Set([resultDateStr, priorDateStr])];

    await conn.beginTransaction();
    let settledCount = 0;
    let missingResultDates = 0;

    for (const checkDate of datesToCheck) {
      // Check if close_datetime has passed for this date
      if (!canSettleGame(game, checkDate, now)) {
        continue;
      }

      const [results] = await conn.query(
        `SELECT id, result_number, is_settled
         FROM game_results
         WHERE game_id = ? AND result_date = ? AND declared_at IS NOT NULL
         LIMIT 1`,
        [id, checkDate]
      );

      if (results.length === 0) {
        // Check if there are pending bets for this session
        const [[{ cnt }]] = await conn.query(
          'SELECT COUNT(*) as cnt FROM bets WHERE game_id = ? AND COALESCE(session_date, DATE(created_at)) = ? AND status = ?',
          [id, checkDate, 'pending']
        );
        if (cnt > 0) missingResultDates++;
        continue;
      }

      // Skip already-settled results
      if (results[0].is_settled) continue;

      const resultId = results[0].id;
      const resultStr = results[0].result_number.toString().padStart(2, '0');

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
