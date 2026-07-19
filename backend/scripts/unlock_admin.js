/**
 * Clears the login lockout for all admin/moderator accounts.
 * Run once on the server:  node scripts/unlock_admin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');

(async () => {
  const [result] = await pool.query(
    `UPDATE users
     SET failed_login_attempts = 0,
         login_blocked_until   = NULL
     WHERE role IN ('admin', 'moderator')`,
  );
  console.log(`Unlocked ${result.affectedRows} account(s).`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
