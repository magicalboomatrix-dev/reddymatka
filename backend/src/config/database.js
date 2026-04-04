const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'REDDYMATKA',
  waitForConnections: true,
  connectionLimit: 50,
  // Cap the internal wait queue at 100 requests.  When the pool is fully
  // saturated and 100 requests are already queued, new requests fail fast
  // with a "pool queue limit reached" error instead of piling up silently
  // and causing cascading latency.
  queueLimit: 100,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+05:30',
});

module.exports = pool;
