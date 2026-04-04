require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // Seed daily_bonus_amount — safe to re-run (ON DUPLICATE KEY UPDATE is a no-op)
  await c.query(
    `INSERT INTO settings (setting_key, setting_value, description)
     VALUES ('daily_bonus_amount', '5', 'Daily login bonus amount in INR')
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`
  );
  console.log('✅ daily_bonus_amount seeded (value: 5)');

  const [rows] = await c.query(
    `SELECT setting_key, setting_value FROM settings WHERE setting_key = 'daily_bonus_amount'`
  );
  console.table(rows);

  await c.end();
})();
