'use strict';
/**
 * Settlement Worker — standalone process entry point.
 *
 * Run this as a SEPARATE process from the HTTP server:
 *   node src/worker.js
 *
 * With PM2:
 *   pm2 start src/worker.js --name settlement-worker
 *
 * Why separate?
 *   • GC pressure from settlement processing cannot stall HTTP request handling.
 *   • The worker can be restarted independently without dropping HTTP connections.
 *   • Multiple HTTP server instances can run behind a load balancer while a
 *     single (or replicated) worker drains the settlement_queue safely via
 *     SELECT … FOR UPDATE SKIP LOCKED.
 */
require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';

const { startAutoSettle } = require('./utils/auto-settle');
const { startWatchdog, stopWatchdog } = require('./utils/watchdog');
const redis = require('./services/redis.service');
const eventBus = require('./utils/event-bus');
const logger = require('./utils/logger');

async function main() {
  logger.info('worker', 'Settlement worker starting');
  await redis.init();
  // Initialise Redis publisher so worker events (wallet_updated, bet_settled,
  // recent_winner) are forwarded to the HTTP server's Socket.IO instance.
  await eventBus.initPublisher();
  startAutoSettle();
  startWatchdog(); // financial watchdog — 5-min checks, Telegram alerts

  // Graceful shutdown
  function shutdown(signal) {
    logger.info('worker', `Received ${signal} — shutting down`);
    const { stopAutoSettle } = require('./utils/auto-settle');
    stopAutoSettle();
    stopWatchdog();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('worker', 'Failed to start settlement worker', err);
  process.exit(1);
});
