require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function generateReferralCode() {
  return 'REDDYMATKAADM' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function seedAdmin() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'REDDYMATKA',
  });

  const adminName = process.env.SEED_ADMIN_NAME || 'Admin';
  const adminPhone = process.env.SEED_ADMIN_PHONE || '9999999999';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const [existingAdmins] = await connection.query(
    'SELECT id, referral_code FROM users WHERE phone = ? LIMIT 1',
    [adminPhone]
  );

  let adminId;

  if (existingAdmins.length > 0) {
    adminId = existingAdmins[0].id;
    const referralCode = existingAdmins[0].referral_code || generateReferralCode();

    await connection.query(
      `UPDATE users
       SET name = ?, password = ?, role = 'admin', referral_code = ?, is_blocked = 0
       WHERE id = ?`,
      [adminName, passwordHash, referralCode, adminId]
    );
  } else {
    const [insertResult] = await connection.query(
      `INSERT INTO users (name, phone, password, role, referral_code)
       VALUES (?, ?, ?, 'admin', ?)`,
      [adminName, adminPhone, passwordHash, generateReferralCode()]
    );
    adminId = insertResult.insertId;
  }

  await connection.query(
    `INSERT INTO wallets (user_id, balance, bonus_balance)
     VALUES (?, 0.00, 0.00)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [adminId]
  );

  console.log('Admin seeded successfully');
  console.log(`Phone: ${adminPhone}`);
  console.log(`Password: ${adminPassword}`);

  await connection.end();
}

seedAdmin().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exit(1);
});