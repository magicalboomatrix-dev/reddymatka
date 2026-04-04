const pool = require('../config/database');
const { settleBetsForGame } = require('./settle-bets');
const { canSettleGame } = require('./game-time');
const logger = require('./logger');
const eventBus = require('./event-bus');

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 5;

// ── Queue helpers ────────────────────────────────────────────────────

/**
 * Enqueue a settlement job.
 * Uses INSERT IGNORE so duplicate game_result_id is silently skipped.
 */
async function enqueueSettlement(conn, { gameResultId, gameId, resultNumber, resultDate }) {
  await conn.query(
    `INSERT IGNORE INTO settlement_queue
       (game_result_id, game_id, result_number, result_date, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [gameResultId, gameId, resultNumber, resultDate]
  );
}

// ── Worker ───────────────────────────────────────────────────────────

/**
 * Settlement queue worker — runs every tick (default 15 s).
 *
 * 1. Recover stale "processing" jobs that were abandoned (> 5 min).
 * 2. Claim one pending job with SELECT … FOR UPDATE SKIP LOCKED.
 * 3. Settle bets inside a transaction.
 * 4. Mark the queue row "done" and game_results.is_settled = 1.
 * 5. On failure, increment attempts; mark "failed" after MAX_ATTEMPTS.
 *
 * Only one job is processed per tick to keep transactions short.
 */
async function processQueue() {
  const conn = await pool.getConnection();
  // Hoisted so the catch block can reference it without a fragile MAX(id) query
  let queueId = null;
  try {
    // ── Step 1: Recover stale processing rows ──
    await conn.query(
      `UPDATE settlement_queue
       SET status = 'pending', started_at = NULL
       WHERE status = 'processing'
         AND started_at < NOW() - INTERVAL ? MINUTE`,
      [STALE_PROCESSING_MINUTES]
    );

    // ── Step 2: Claim one pending job ──
    await conn.beginTransaction();

    const [jobs] = await conn.query(
      `SELECT sq.id AS queue_id, sq.game_result_id, sq.game_id,
              sq.result_number, sq.result_date, sq.attempts,
              g.open_time, g.close_time, g.is_overnight, g.name AS game_name
       FROM settlement_queue sq
       JOIN games g ON g.id = sq.game_id
       WHERE sq.status = 'pending'
       ORDER BY sq.created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      []
    );

    if (jobs.length === 0) {
      await conn.commit();
      return;
    }

    const job = jobs[0];
    queueId = job.queue_id;

    // Check if game close time has passed (safe to settle)
    const now = new Date();
    if (!canSettleGame(job, job.result_date, now)) {
      // Not yet time — leave pending
      await conn.commit();
      return;
    }

    // Mark as processing
    await conn.query(
      `UPDATE settlement_queue SET status = 'processing', started_at = NOW(), attempts = attempts + 1 WHERE id = ?`,
      [job.queue_id]
    );

    await conn.commit();

    // ── Step 3: Settle inside a fresh transaction ──
    await conn.beginTransaction();

    // Double-settlement guard: lock game_results row
    const [locked] = await conn.query(
      'SELECT id FROM game_results WHERE id = ? AND is_settled = 0 FOR UPDATE',
      [job.game_result_id]
    );

    if (locked.length === 0) {
      // Already settled — mark queue done
      await conn.query(
        `UPDATE settlement_queue SET status = 'done', completed_at = NOW() WHERE id = ?`,
        [job.queue_id]
      );
      await conn.commit();
      return;
    }

    const resultStr = job.result_number.toString().padStart(2, '0');
    const count = await settleBetsForGame(conn, job.game_id, resultStr, job.game_result_id, job, job.result_date);

    // Mark settled
    await conn.query('UPDATE game_results SET is_settled = 1 WHERE id = ?', [job.game_result_id]);
    await conn.query(
      `UPDATE settlement_queue SET status = 'done', completed_at = NOW() WHERE id = ?`,
      [job.queue_id]
    );

    await conn.commit();

    // Emit outside the transaction — purely informational, no rollback risk
    if (count > 0) {
      eventBus.emit('bet_settled', {
        gameId: job.game_id,
        settledCount: count,
        resultDate: job.result_date,
      });
    }

    if (count > 0) {
      logger.info('settle-worker', `Settled ${count} bets`, { queueId: job.queue_id, gameId: job.game_id, gameName: job.game_name, resultDate: job.result_date });
    }
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore rollback errors */ }

    // Try to mark the job as failed (use hoisted queueId — avoids MAX(id) race)
    if (queueId !== null) {
      try {
        const [rows] = await pool.query(
          'SELECT attempts FROM settlement_queue WHERE id = ? LIMIT 1',
          [queueId]
        );
        if (rows.length > 0) {
          const newStatus = rows[0].attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
          await pool.query(
            `UPDATE settlement_queue SET status = ?, error_message = ?, started_at = NULL WHERE id = ?`,
            [newStatus, err.message.slice(0, 2000), queueId]
          );
        }
      } catch (_) { /* best-effort */ }
    }

    logger.error('settle-worker', 'Settlement error', err);
  } finally {
    conn.release();
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────

let intervalId = null;

function startAutoSettle(intervalMs = 15_000) {
  if (intervalId) return;
  logger.info('settle-worker', `Started — polling every ${intervalMs / 1000} seconds`);
  processQueue();
  intervalId = setInterval(processQueue, intervalMs);
}

function stopAutoSettle() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startAutoSettle, stopAutoSettle, enqueueSettlement };
