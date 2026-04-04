'use strict';

const EventEmitter = require('events');
const logger = require('./logger');

// Redis channel name shared between publisher (worker) and subscriber (HTTP server).
const REDIS_CHANNEL = 'platform_events';

let _publisher = null;

// Singleton process-wide event bus.
// Within a single process, events are dispatched via EventEmitter as before.
// When initPublisher() has been called (worker process only), every emit() is
// also published to the Redis channel so the HTTP server can relay the events
// to Socket.IO clients.  Callers (settle-bets.js, wallet-ledger.js, etc.)
// are unchanged — they still call eventBus.emit() exactly as before.
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

// Override emit() so every event is mirrored into Redis when a publisher is
// active for this process.  Local in-process listeners are always called first.
const _nativeEmit = EventEmitter.prototype.emit.bind(eventBus);
eventBus.emit = function (event, data) {
  _nativeEmit(event, data);
  if (_publisher) {
    _publisher
      .publish(REDIS_CHANNEL, JSON.stringify({ event, data }))
      .catch((err) =>
        logger.warn('event-bus', 'Redis publish failed', { message: err.message })
      );
  }
};

/**
 * Initialise a dedicated Redis publisher for this process.
 * Call once in the Worker process after Redis is ready.
 * Silently falls back to in-process-only mode when Redis is unavailable.
 */
eventBus.initPublisher = async function () {
  if (!process.env.REDIS_URL) {
    logger.info('event-bus', 'REDIS_URL not set — running in-process event bus only');
    return;
  }
  try {
    // ioredis is an optional dependency — already installed as part of the cache layer.
    // eslint-disable-next-line import/no-extraneous-dependencies
    const Redis = require('ioredis');
    _publisher = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });
    _publisher.on('error', (err) =>
      logger.warn('event-bus', 'Publisher connection error', { message: err.message })
    );
    await _publisher.connect();
    logger.info('event-bus', 'Redis publisher connected');
  } catch (err) {
    logger.warn('event-bus', 'Redis publisher failed — falling back to in-process bus only', {
      message: err.message,
    });
    _publisher = null;
  }
};

module.exports = eventBus;
