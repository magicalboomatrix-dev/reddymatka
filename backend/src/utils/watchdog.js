'use strict';
const https = require('https');

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
 * Alerts are sent via the Telegram Bot API to the configured admin chat.
 * The watchdog never throws — all errors are swallowed so it cannot affect
 * the HTTP server or worker process that hosts it.
 *
 * Environment variables required for Telegram alerts:
 *   TELEGRAM_BOT_TOKEN   — bot token from BotFather
 *   TELEGRAM_ALERT_CHAT  — chat_id to deliver alerts to (can differ from
 *                          the UPI webhook chat)
 *
 * If those vars are absent, alerts are only written to the logger.
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

// ── Telegram helper ───────────────────────────────────────────────────────────
async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // No Telegram config — alert stays in logs only
    return;
  }

  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
      const options = {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            logger.warn('watchdog', 'Telegram alert delivery failed', { status: res.statusCode, body: data });
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        logger.warn('watchdog', 'Telegram alert error', { message: err.message });
        resolve();
      });

      req.write(body);
      req.end();
    } catch (err) {
      logger.warn('watchdog', 'Telegram alert error', { message: err.message });
      resolve();
    }
  });
}

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

  const alertMsg =
    `🚨 <b>REDDYMATKA — Settlement Alert</b>\n\n` +
    `${cnt} settlement job(s) are in <b>FAILED</b> status.\n` +
    `Go to Settlement Monitor → retry failed jobs.\n\n` +
    `<i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

  logger.warn('watchdog', `${cnt} failed settlement job(s) detected`);
  await sendTelegramAlert(alertMsg);
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

  const alertMsg =
    `⚠️ <b>REDDYMATKA — Stale Settlement Jobs</b>\n\n` +
    `${cnt} job(s) have been in <b>PROCESSING</b> state for ` +
    `more than ${STALE_PROCESSING_MINUTES} minutes.\n` +
    `The settlement worker may have crashed.\n\n` +
    `<i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

  logger.warn('watchdog', `${cnt} stale settlement job(s) detected`);
  await sendTelegramAlert(alertMsg);
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
    'SELECT COALESCE(SUM(balance), 0) AS total FROM wallets'
  );
  const [[txnSum]] = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions WHERE status = ?',
    ['completed']
  );

  const walletTotal = parseFloat(walletSum.total);
  const txnTotal = parseFloat(txnSum.total);
  const drift = Math.abs(walletTotal - txnTotal);

  if (drift > 0.01) {
    const alertMsg =
      `🔴 <b>REDDYMATKA — Ledger Drift Detected</b>\n\n` +
      `Wallet balances total: <b>₹${walletTotal.toFixed(2)}</b>\n` +
      `Transaction net total: <b>₹${txnTotal.toFixed(2)}</b>\n` +
      `Drift: <b>₹${drift.toFixed(2)}</b>\n\n` +
      `Investigate wallet_transactions immediately.\n\n` +
      `<i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;

    logger.error('watchdog', 'Ledger drift detected', { walletTotal, txnTotal, drift });
    await sendTelegramAlert(alertMsg);
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
