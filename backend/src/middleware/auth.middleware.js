const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const redis = require('../services/redis.service');

const USER_CACHE_TTL = 60; // seconds

// Cache key for a user row
function userCacheKey(id) {
  return `auth:user:${id}`;
}

// Invalidate a user's cached row (call after block / delete / role change)
async function invalidateUserCache(id) {
  await redis.del(userCacheKey(id));
}

// Parse the HttpOnly `token` cookie from the raw Cookie header (no cookie-parser needed)
function getCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const found = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
  return found ? decodeURIComponent(found.slice(6)) : null;
}

const authenticate = async (req, res, next) => {
  try {
    // Prefer HttpOnly cookie; fall back to Authorization Bearer header
    let token = getCookieToken(req.headers.cookie);
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
      }
      token = authHeader.split(' ')[1];
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── Redis warm path ──────────────────────────────────────────────────────
    const cacheKey = userCacheKey(decoded.id);
    const cached = await redis.get(cacheKey);
    if (cached) {
      req.user = JSON.parse(cached);
      return next();
    }

    // ── DB cold path ─────────────────────────────────────────────────────────
    const [users] = await pool.query(
      'SELECT id, name, phone, role, moderator_id, referral_code, is_blocked, is_deleted, created_at FROM users WHERE id = ?',
      [decoded.id]
    );
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    if (users[0].is_deleted) {
      return res.status(403).json({ error: 'Account has been removed. Contact support.' });
    }

    if (users[0].is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
    }

    // Store in Redis for subsequent requests (TTL 60 s)
    await redis.set(cacheKey, JSON.stringify(users[0]), USER_CACHE_TTL);

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize, invalidateUserCache };
