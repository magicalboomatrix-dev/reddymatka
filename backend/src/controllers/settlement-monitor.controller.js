'use strict';

const pool = require('../config/database');

/** GET /api/settlement-monitor/queue */
exports.getQueue = async (req, res, next) => {
  try {
    const rawStatus = req.query.status || 'pending,processing,failed';
    const statuses = rawStatus
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['pending', 'processing', 'done', 'failed'].includes(s));

    if (statuses.length === 0) {
      return res.status(400).json({ error: 'Invalid status filter.' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const placeholders = statuses.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT sq.id, sq.game_result_id, sq.game_id, sq.result_number,
              sq.result_date, sq.status, sq.attempts, sq.error_message,
              sq.created_at, sq.started_at, sq.completed_at,
              g.name AS game_name
       FROM settlement_queue sq
       JOIN games g ON g.id = sq.game_id
       WHERE sq.status IN (${placeholders})
       ORDER BY sq.created_at DESC
       LIMIT ? OFFSET ?`,
      [...statuses, limit, offset]
    );

    const [countRow] = await pool.query(
      `SELECT COUNT(*) AS total FROM settlement_queue WHERE status IN (${placeholders})`,
      statuses
    );

    res.json({ queue: rows, total: countRow[0].total });
  } catch (error) {
    next(error);
  }
};

/** GET /api/settlement-monitor/stats */
exports.getStats = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM settlement_queue GROUP BY status'
    );

    const stats = { pending: 0, processing: 0, done: 0, failed: 0, stale: 0 };
    for (const row of rows) {
      if (row.status in stats) stats[row.status] = Number(row.count);
    }

    const [staleRow] = await pool.query(
      `SELECT COUNT(*) AS stale FROM settlement_queue
       WHERE status = 'processing' AND started_at < NOW() - INTERVAL 5 MINUTE`
    );
    stats.stale = Number(staleRow[0].stale);

    res.json({ stats });
  } catch (error) {
    next(error);
  }
};

/** POST /api/settlement-monitor/retry/:id */
exports.retryFailed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `UPDATE settlement_queue
       SET status = 'pending', attempts = 0, error_message = NULL
       WHERE id = ? AND status = 'failed'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Failed job not found.' });
    }

    res.json({ message: 'Job re-queued for retry.' });
  } catch (error) {
    next(error);
  }
};
