'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

let io = null;

/**
 * Attaches Socket.IO to an existing http.Server instance.
 * Must be called once, immediately after http.createServer(app).
 */
function initSocket(httpServer) {
  const allowedOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL]
    .flatMap((v) => String(v || '').split(','))
    .map((v) => v.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── JWT auth middleware ──────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      // 1. Explicit auth token (admin panel, backward-compat clients)
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      // 2. HttpOnly cookie (browser clients using withCredentials)
      if (!token) {
        const rawCookie = socket.handshake.headers.cookie || '';
        const found = rawCookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
        if (found) token = decodeURIComponent(found.slice(6));
      }

      if (!token) return next(new Error('Unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role || 'user';
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────
  io.on('connection', (socket) => {
    socket.join(`user_${socket.userId}`);
    if (socket.userRole === 'admin' || socket.userRole === 'moderator') {
      socket.join('admin');
    }

    socket.on('subscribe_game', (gameId) => {
      if (Number.isInteger(Number(gameId))) {
        socket.join(`game_${gameId}`);
      }
    });

    socket.on('unsubscribe_game', (gameId) => {
      socket.leave(`game_${gameId}`);
    });
  });

  // ── Bridge internal event-bus to socket rooms ────────────────────────
  eventBus.on('result_declared', ({ gameId, resultId, resultDate, resultNumber }) => {
    io.to(`game_${gameId}`).emit('result_declared', { gameId, resultId, resultDate, resultNumber });
    io.to('admin').emit('result_declared', { gameId, resultId, resultDate, resultNumber });
  });

  eventBus.on('bet_settled', ({ gameId, settledCount, resultDate }) => {
    io.to(`game_${gameId}`).emit('bet_settled', { gameId, settledCount, resultDate });
    io.to('admin').emit('bet_settled', { gameId, settledCount, resultDate });
  });

  eventBus.on('fraud_alert', ({ userId, alertType, severity }) => {
    io.to('admin').emit('fraud_alert', { userId, alertType, severity });
  });

  eventBus.on('wallet_updated', ({ userId, balance }) => {
    io.to(`user_${userId}`).emit('wallet_updated', { balance });
  });

  eventBus.on('recent_winner', ({ userName, amount, betType, gameId }) => {
    // Broadcast to all connected clients so the winners ticker updates live.
    // userId is intentionally excluded — only the masked display name is sent.
    io.emit('recent_winner', { userName, amount, betType, gameId });
  });

  // Start Redis subscriber to bridge worker-process events to Socket.IO rooms.
  // This runs as fire-and-forget — a startup failure degrades to in-process only.
  initRedisSubscriber().catch(() => {});

  logger.info('socket', 'Socket.IO initialised');
  return io;
}

// ── Redis cross-process bridge ──────────────────────────────────────────────
//
// The settlement worker runs in a separate OS process.  Events it emits on the
// local EventEmitter never reach this process's Socket.IO instance.
// initRedisSubscriber() opens a dedicated ioredis connection and subscribes to
// the 'platform_events' channel.  When a message arrives it is dispatched
// directly to the relevant Socket.IO rooms via bridgeToSocket(), bypassing the
// local EventEmitter to avoid double-emitting events that the HTTP server
// already handles itself (result_declared, fraud_alert).

const REDIS_CHANNEL = 'platform_events';

function bridgeToSocket(event, data) {
  if (!io) return;
  switch (event) {
    case 'wallet_updated':
      io.to(`user_${data.userId}`).emit('wallet_updated', { balance: data.balance });
      break;
    case 'bet_settled':
      io.to(`game_${data.gameId}`).emit('bet_settled', data);
      io.to('admin').emit('bet_settled', data);
      break;
    case 'recent_winner':
      io.emit('recent_winner', data);
      break;
    default:
      // Unknown event type — ignore silently to stay forward-compatible.
      break;
  }
}

async function initRedisSubscriber() {
  if (!process.env.REDIS_URL) return;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const Redis = require('ioredis');
    const subscriber = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });
    subscriber.on('error', (err) =>
      logger.warn('socket', 'Redis subscriber error', { message: err.message })
    );
    await subscriber.connect();
    await subscriber.subscribe(REDIS_CHANNEL);
    subscriber.on('message', (_channel, message) => {
      try {
        const { event, data } = JSON.parse(message);
        bridgeToSocket(event, data);
      } catch (err) {
        logger.warn('socket', 'Malformed Redis event message', { message: err.message });
      }
    });
    logger.info('socket', 'Redis event subscriber connected');
  } catch (err) {
    logger.warn(
      'socket',
      'Redis subscriber init failed — worker events will not reach sockets',
      { message: err.message }
    );
  }
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };
