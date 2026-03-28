require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const bankAccountRoutes = require('./routes/bank-account.routes');
const walletRoutes = require('./routes/wallet.routes');
const gameRoutes = require('./routes/game.routes');
const betRoutes = require('./routes/bet.routes');
const depositRoutes = require('./routes/deposit.routes');
const withdrawRoutes = require('./routes/withdraw.routes');
const bonusRoutes = require('./routes/bonus.routes');
const resultRoutes = require('./routes/result.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const moderatorRoutes = require('./routes/moderator.routes');
const moderatorSelfRoutes = require('./routes/moderator-self.routes');
const adminRoutes = require('./routes/admin.routes');
const notificationRoutes = require('./routes/notification.routes');
const customAdsRoutes = require('./routes/home-banner.routes');

const { errorHandler } = require('./middleware/error.middleware');
const { startAutoSettle } = require('./utils/auto-settle');

const app = express();

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

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', limiter);

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
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/moderators', moderatorRoutes);
app.use('/api/moderator', moderatorSelfRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/custom-ads', customAdsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startAutoSettle();
});

module.exports = app;
