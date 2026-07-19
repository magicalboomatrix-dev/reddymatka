require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const walletRoutes = require('./routes/wallet.routes');
const gameRoutes = require('./routes/game.routes');
const betRoutes = require('./routes/bet.routes');
const depositRoutes = require('./routes/deposit.routes');
const withdrawRoutes = require('./routes/withdraw.routes');
const bonusRoutes = require('./routes/bonus.routes');
const resultRoutes = require('./routes/result.routes');
const jantriRoutes = require('./routes/jantri.routes');
const moderatorRoutes = require('./routes/moderator.routes');
const moderatorSelfRoutes = require('./routes/moderator-self.routes');
const adminRoutes = require('./routes/admin.routes');
const notificationRoutes = require('./routes/notification.routes');
const customAdsRoutes = require('./routes/home-banner.routes');
const telegramRoutes = require('./routes/telegram.routes');
const smsWebhookRoutes = require('./routes/sms-webhook.routes');
const autoDepositRoutes = require('./routes/auto-deposit.routes');
const settlementMonitorRoutes = require('./routes/settlement-monitor.routes');
const walletAuditRoutes = require('./routes/wallet-audit.routes');
const howToPlayRoutes = require('./routes/how-to-play.routes');
const supportRoutes = require('./routes/support.routes');

const { errorHandler } = require('./middleware/error.middleware');
const { expirePendingOrders } = require('./services/auto-deposit-matcher');
const { startRetryWorker } = require('./services/auto-deposit-retry');
// Settlement worker runs as a SEPARATE process (src/worker.js).
// Do NOT import or start auto-settle here — it causes duplicate processing
// when multiple HTTP server instances are deployed.
const { initSocket } = require('./services/socket.service');
const redis = require('./services/redis.service');
const pool = require('./config/database');
const logger = require('./utils/logger');

const app = express();
const PENDING_ORDER_EXPIRY_INTERVAL_MS = 60_000;

const routeRegistrations = [
  ['/api/auth', authRoutes],
  ['/api/users', userRoutes],
  ['/api/wallet', walletRoutes],
  ['/api/games', gameRoutes],
  ['/api/bets', betRoutes],
  ['/api/deposits', depositRoutes],
  ['/api/withdraw', withdrawRoutes],
  ['/api/bonus', bonusRoutes],
  ['/api/results', resultRoutes],
  ['/api/jantri', jantriRoutes],
  ['/api/moderators', moderatorRoutes],
  ['/api/moderator', moderatorSelfRoutes],
  ['/api/admin', adminRoutes],
  ['/api/notifications', notificationRoutes],
  ['/api/custom-ads', customAdsRoutes],
  ['/api/telegram', telegramRoutes],
  ['/api/sms', smsWebhookRoutes],
  ['/api/auto-deposit', autoDepositRoutes],
  ['/api/settlement-monitor', settlementMonitorRoutes],
  ['/api/wallet-audit', walletAuditRoutes],
  ['/api/how-to-play', howToPlayRoutes],
  ['/api/support', supportRoutes],
];

function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(message ? { message } : {}),
  });
}

function getOriginVariants(origin) {
  if (!origin) {
    return [];
  }

  try {
    const url = new URL(origin);
    const variants = new Set([url.origin]);
    const isLocalHost = ['localhost', '127.0.0.1'].includes(url.hostname);

    if (!isLocalHost && url.hostname.includes('.')) {
      const alternateHost = url.hostname.startsWith('www.')
        ? url.hostname.slice(4)
        : `www.${url.hostname}`;

      variants.add(`${url.protocol}//${alternateHost}${url.port ? `:${url.port}` : ''}`);
    }

    return [...variants];
  } catch {
    return [origin];
  }
}

const allowedOrigins = [process.env.FRONTEND_URL, process.env.ADMIN_URL]
  .flatMap((value) => String(value || '').split(','))
  .map((value) => value.trim())
  .filter(Boolean)
  .flatMap((origin) => getOriginVariants(origin));

// Security
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const corsErr = new Error('Not allowed by CORS');
    corsErr.statusCode = 403;
    return callback(corsErr);
  },
  credentials: true
}));

// Rate limiting
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/auth', authLimiter);

// Stricter rate limits for financial endpoints (keyed by authenticated user ID, fallback IP)
const financialLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/withdraw', financialLimiter);
app.use('/api/bets', financialLimiter);
// Auto-deposit: only rate-limit mutating actions (order creation / cancellation).
// Status checks and history reads are excluded so polling doesn't trigger 429s.
app.use('/api/auto-deposit/order', (req, res, next) => {
  // GET /order/status/:id — read-only, skip limiter
  if (req.method === 'GET') return next();
  return financialLimiter(req, res, next);
});
app.use('/api/auto-deposit/orders', (req, res, next) => next()); // history read — skip
app.use('/api/auto-deposit/admin', (req, res, next) => next()); // admin routes — skip

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Routes
routeRegistrations.forEach(([routePath, routeHandler]) => {
  app.use(routePath, routeHandler);
});

// Health check — probes MySQL and Redis so load balancers and uptime monitors
// receive a real signal instead of a static 200.
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    database: 'ok',
    redis: redis.isConnected() ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
  };

  let httpStatus = 200;

  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
  } catch {
    health.database = 'error';
    health.status = 'degraded';
    httpStatus = 500;
  }

  res.status(httpStatus).json(health);
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT;
const httpServer = http.createServer(app);
initSocket(httpServer);
redis.init();
httpServer.listen(PORT, () => {
  logger.info('server', `Server running on port ${PORT}`);

  // Expire stale deposit orders every 60 seconds
  setInterval(async () => {
    try {
      const expired = await expirePendingOrders();
      if (expired > 0) {
        logger.info('auto-deposit', `Expired ${expired} stale deposit orders`);
      }
    } catch (err) {
      logger.error('auto-deposit', 'Order expiry error', err);
    }
  }, PENDING_ORDER_EXPIRY_INTERVAL_MS);

  // Start auto-deposit retry worker (re-matches unmatched webhook transactions every 15s)
  startRetryWorker();
});

module.exports = { app, httpServer };
