require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('\n=== Critical Settings ===');
  const [settings] = await c.query(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'daily_bonus_amount','min_bet','max_bet_full',
       'max_bet_30min','max_bet_last_30','min_withdraw'
     ) ORDER BY setting_key`
  );
  console.table(settings);

  console.log('\n=== Verifying New Tables ===');
  const [tables] = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()
     AND table_name IN ('fraud_alerts','daily_bonus_claims','admin_activity_logs','settlement_queue')
     ORDER BY table_name`
  );
  console.table(tables);

  console.log('\n=== bonuses ENUM ===');
  const [cols] = await c.query(
    `SELECT column_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'bonuses' AND column_name = 'type'`
  );
  console.log(cols[0]?.COLUMN_TYPE || cols[0]?.column_type);

  console.log('\n=== wallet_transactions UNIQUE constraint ===');
  const [idx] = await c.query(
    `SHOW INDEX FROM wallet_transactions WHERE Key_name != 'PRIMARY'`
  );
  idx.forEach(i => console.log(i.Key_name, i.Column_name, i.Non_unique));

  await c.end();
})();
