/**
 * Financial Watchdog Service
 *
 * Runs on a configurable interval (default: 5 minutes) and checks for
 * conditions that require immediate operator attention:
 *
 *   1. Failed settlement jobs in settlement_queue
 *   2. Stale ("processing" for > 10 min) settlement jobs
 *   3. Wallet ledger drift — total wallet balances vs last N transactions
 *
 * Alerts are written to the logger.
 * The watchdog never throws — all errors are swallowed so it cannot affect
 * the HTTP server or worker process that hosts it.
 */

const pool = require('../config/database');
const logger = require('./logger');

// ── Config ────────────────────────────────────────────────────────────────────
const STALE_PROCESSING_MINUTES = 10;
// How many consecutive failed checks must occur before re-alerting (prevents spam)
const ALERT_COOLDOWN_TICKS = 3; // 3 × interval ≈ 15 min at default 5-min interval

// ── State ─────────────────────────────────────────────────────────────────────
let intervalId = null;
let failedSettlementCooldown = 0;
let staleJobCooldown = 0;

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkFailedSettlements() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM settlement_queue WHERE status = 'failed'"
  );
  const cnt = Number(rows[0].cnt);

  if (cnt === 0) {
    failedSettlementCooldown = 0;
    return;
  }

  if (failedSettlementCooldown > 0) {
    failedSettlementCooldown--;
    return;
  }

  logger.warn('watchdog', `${cnt} failed settlement job(s) detected`);
  try {
    await pool.query(
      'INSERT INTO system_alerts (level, context, message, data) VALUES (?, ?, ?, ?)',
      ['warn', 'watchdog', `${cnt} failed settlement job(s) detected`, JSON.stringify({ count: cnt })]
    );
  } catch (err) {
    logger.error('watchdog', 'Failed to insert alert into DB', err);
  }
  failedSettlementCooldown = ALERT_COOLDOWN_TICKS;
}

async function checkStaleJobs() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM settlement_queue
     WHERE status = 'processing'
       AND started_at < NOW() - INTERVAL ? MINUTE`,
    [STALE_PROCESSING_MINUTES]
  );
  const cnt = Number(rows[0].cnt);

  if (cnt === 0) {
    staleJobCooldown = 0;
    return;
  }

  if (staleJobCooldown > 0) {
    staleJobCooldown--;
    return;
  }

  logger.warn('watchdog', `${cnt} stale settlement job(s) detected`);
  try {
    await pool.query(
      'INSERT INTO system_alerts (level, context, message, data) VALUES (?, ?, ?, ?)',
      ['warn', 'watchdog', `${cnt} stale settlement job(s) detected`, JSON.stringify({ count: cnt })]
    );
  } catch (err) {
    logger.error('watchdog', 'Failed to insert alert into DB', err);
  }
  staleJobCooldown = ALERT_COOLDOWN_TICKS;
}

/**
 * Lightweight ledger drift check.
 * Compares the sum of all wallet balances against the net sum of all
 * wallet_transactions. A non-zero difference indicates drift.
 * NOTE: This is an eventual-consistency check — a tiny lag is expected mid-
 * transaction. We only alert when drift is material (> ₹0.01).
 */
async function checkLedgerDrift() {
  const [[walletSum]] = await pool.query(
    'SELECT COALESCE(SUM(balance + bonus_balance), 0) AS total FROM wallets'
  );
  const [[txnSum]] = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE status = ?',
    ['completed']
  );

  const walletTotal = parseFloat(walletSum.total);
  const txnTotal = parseFloat(txnSum.total);
  const drift = Math.abs(walletTotal - txnTotal);

  if (drift > 0.01) {
    logger.error('watchdog', 'Ledger drift detected', { walletTotal, txnTotal, drift });
    try {
      await pool.query(
        'INSERT INTO system_alerts (level, context, message, data) VALUES (?, ?, ?, ?)',
        ['error', 'watchdog', 'Ledger drift detected', JSON.stringify({ walletTotal, txnTotal, drift })]
      );
    } catch (err) {
      logger.error('watchdog', 'Failed to insert alert into DB', err);
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  try {
    await Promise.all([
      checkFailedSettlements(),
      checkStaleJobs(),
      checkLedgerDrift(),
    ]);
  } catch (err) {
    // Watchdog must never crash the host process
    logger.error('watchdog', 'Watchdog tick error', err);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function startWatchdog(intervalMs = 5 * 60 * 1000) {
  if (intervalId) return;
  logger.info('watchdog', `Financial watchdog started — checking every ${intervalMs / 1000}s`);
  // Run immediately on start, then on interval
  tick();
  intervalId = setInterval(tick, intervalMs);
}

function stopWatchdog() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startWatchdog, stopWatchdog };
