'use strict';

const redis = require('../services/redis.service');

/**
 * Response-level cache middleware for GET requests.
 * Cache key = full request URL (path + query string).
 * Transparently falls through when Redis is unavailable.
 *
 * @param {number} ttl  Cache TTL in seconds (default 60)
 */
function cache(ttl = 60) {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl}`;
    const cached = await redis.get(key);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(JSON.parse(cached));
    }

    // Wrap res.json so we can store the response before it is sent.
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache 2xx responses.
      // Add a small random jitter (0–10 s) to the TTL so keys set at the
      // same time across many requests expire at slightly different moments,
      // preventing a cache stampede when a popular key expires under load.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const jitter = Math.floor(Math.random() * 11);
        redis.set(key, JSON.stringify(data), ttl + jitter).catch(() => {});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

module.exports = { cache };
