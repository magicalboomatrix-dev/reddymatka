'use strict';

const logger = require('../utils/logger');

let client = null;
let isReady = false;

/** Connect to Redis if REDIS_URL is set. Silently degrades if unavailable. */
async function init() {
  if (!process.env.REDIS_URL) {
    logger.info('redis', 'REDIS_URL not configured — cache layer disabled');
    return;
  }

  try {
    // ioredis is an optional dependency — only required when REDIS_URL is set.
    // eslint-disable-next-line import/no-extraneous-dependencies
    const Redis = require('ioredis');

    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });

    client.on('ready', () => {
      isReady = true;
      logger.info('redis', 'Connected');
    });

    client.on('error', (err) => {
      if (isReady) {
        logger.warn('redis', 'Connection error — cache degraded', { message: err.message });
      }
      isReady = false;
    });

    client.on('close', () => {
      isReady = false;
    });

    await client.connect();
  } catch (err) {
    logger.warn('redis', 'Failed to initialise — cache layer disabled', { message: err.message });
    isReady = false;
  }
}

async function get(key) {
  if (!isReady) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  if (!isReady) return;
  try {
    await client.set(key, value, 'EX', ttlSeconds);
  } catch {
    // best-effort — cache miss is not a failure
  }
}

async function del(key) {
  if (!isReady) return;
  try {
    await client.del(key);
  } catch {
    // best-effort
  }
}

/** Delete all keys matching a glob pattern (e.g. "cache:/api/games*").
 *  Uses cursor-based SCAN instead of the blocking KEYS command so large
 *  keyspaces do not stall the Redis event loop. */
async function delPattern(pattern) {
  if (!isReady) return;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // best-effort
  }
}

function isConnected() {
  return isReady;
}

module.exports = { init, get, set, del, delPattern, isConnected };
