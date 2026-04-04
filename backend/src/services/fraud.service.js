'use strict';

const pool = require('../config/database');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

// ── Thresholds ─────────────────────────────────────────────────────────
const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_MAX_BETS = 20;
const LARGE_BET_THRESHOLD = 5000;

/**
 * Run fraud checks for a bet placement.
 * Should be called OUTSIDE the database transaction, as fire-and-forget.
 * Never throws — errors are swallowed to protect the main request flow.
 *
 * @param {number} userId
 * @param {number} betAmount  Total bet amount for the placement
 */
async function runChecks(userId, betAmount) {
  try {
    await Promise.all([
      checkVelocity(userId),
      checkLargeBet(userId, betAmount),
    ]);
  } catch (err) {
    logger.error('fraud', 'Fraud check error', err);
  }
}

async function checkVelocity(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM bets
     WHERE user_id = ?
       AND created_at >= NOW() - INTERVAL ? MINUTE`,
    [userId, VELOCITY_WINDOW_MINUTES]
  );
  if (rows[0].cnt > VELOCITY_MAX_BETS) {
    await raiseAlert(userId, 'velocity', 'high', {
      bets_in_window: rows[0].cnt,
      window_minutes: VELOCITY_WINDOW_MINUTES,
    });
  }
}

async function checkLargeBet(userId, betAmount) {
  if (betAmount >= LARGE_BET_THRESHOLD) {
    await raiseAlert(userId, 'large_bet', 'medium', {
      bet_amount: betAmount,
      threshold: LARGE_BET_THRESHOLD,
    });
  }
}

async function raiseAlert(userId, alertType, severity, details) {
  try {
    await pool.query(
      `INSERT INTO fraud_alerts (user_id, alert_type, severity, details)
       VALUES (?, ?, ?, ?)`,
      [userId, alertType, severity, JSON.stringify(details)]
    );
    eventBus.emit('fraud_alert', { userId, alertType, severity });
    logger.warn('fraud', `Alert: ${alertType}`, { userId, severity, ...details });
  } catch (err) {
    logger.error('fraud', 'Failed to raise alert', err);
  }
}

module.exports = { runChecks };
