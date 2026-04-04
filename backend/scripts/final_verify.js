/**
 * Final System Verification Script
 * Simulates the critical paths without modifying production data.
 * Read-only queries plus logic tests.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// ── Inline logic imports (no server boot needed) ─────────────────────────────
const {
  canPlaceBet,
  getResultDate,
  canSettleGame,
  isOvernightGame,
} = require('../src/utils/game-time');

let pass = 0, fail = 0;

function ok(label) { console.log(`  ✅ ${label}`); pass++; }
function ko(label, detail) { console.error(`  ❌ ${label}: ${detail}`); fail++; }

(async () => {
  const pool = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // ── Phase 5: Settlement pipeline ─────────────────────────────────────────
  console.log('\n=== PHASE 5: Settlement Pipeline ===');

  const [games] = await pool.query('SELECT * FROM games WHERE is_active = 1 LIMIT 5');
  if (games.length > 0) {
    ok(`${games.length} active game(s) found`);

    const now = new Date();
    for (const g of games) {
      const rd = getResultDate(g, now);
      if (rd && rd.match(/^\d{4}-\d{2}-\d{2}$/)) {
        ok(`Game "${g.name}" — result_date: ${rd}`);
      } else {
        ko(`Game "${g.name}" result_date`, rd);
      }
    }

    // Verify no pending bets on settled results (orphan check)
    const [orphans] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM bets b
      JOIN game_results gr ON gr.game_id = b.game_id AND gr.result_date = b.session_date
      WHERE b.status = 'pending' AND gr.is_settled = 1
    `);
    if (orphans[0].cnt === 0) {
      ok('No orphaned pending bets on settled results');
    } else {
      ko('Orphaned pending bets', `${orphans[0].cnt} found`);
    }
  } else {
    ok('No active games (skipping game-time tests)');
  }

  // canPlaceBet logic tests
  const mockGame = { open_time: '10:00:00', close_time: '16:00:00', is_overnight: 0 };
  const settingsMap = { min_bet: 10, max_bet_full: 10000, max_bet_30min: 5000, max_bet_last_30: 1000 };
  const midDay = new Date(); midDay.setHours(12, 0, 0, 0);
  const afterClose = new Date(); afterClose.setHours(17, 0, 0, 0);
  const beforeOpen = new Date(); beforeOpen.setHours(9, 0, 0, 0);

  if (canPlaceBet(mockGame, settingsMap, midDay).allowed) {
    ok('canPlaceBet: allowed at midday for 10:00-16:00 game');
  } else {
    ko('canPlaceBet', 'should be allowed at midday');
  }
  if (!canPlaceBet(mockGame, settingsMap, afterClose).allowed) {
    ok('canPlaceBet: blocked after close');
  } else {
    ko('canPlaceBet', 'should be blocked after close');
  }
  if (!canPlaceBet(mockGame, settingsMap, beforeOpen).allowed) {
    ok('canPlaceBet: blocked before open');
  } else {
    ko('canPlaceBet', 'should be blocked before open');
  }

  const ovGame = { open_time: '22:00:00', close_time: '04:00:00', is_overnight: 1 };
  if (isOvernightGame(ovGame)) {
    ok('isOvernightGame: overnight game detected correctly');
  } else {
    ko('isOvernightGame', 'should detect overnight');
  }

  // ── Phase 6: Wallet Ledger ────────────────────────────────────────────────
  console.log('\n=== PHASE 6: Wallet Ledger ===');

  const [reconResult] = await pool.query(`
    SELECT COUNT(*) AS mismatches FROM (
      SELECT w.user_id,
             ROUND(w.balance - COALESCE(SUM(t.amount), 0), 2) AS drift
      FROM wallets w
      LEFT JOIN wallet_transactions t ON t.user_id = w.user_id
      GROUP BY w.user_id
      HAVING ABS(drift) > 0.01
    ) d
  `);
  if (reconResult[0].mismatches === 0) {
    ok('Wallet balance matches ledger sum for all users');
  } else {
    ko('Wallet reconciliation', `${reconResult[0].mismatches} mismatches`);
  }

  const [dupeRefs] = await pool.query(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT reference_type, reference_id
      FROM wallet_transactions
      WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
      GROUP BY reference_type, reference_id HAVING COUNT(*) > 1
    ) d
  `);
  if (dupeRefs[0].cnt === 0) {
    ok('Idempotency intact — no duplicate (reference_type, reference_id) entries');
  } else {
    ko('Idempotency breach', `${dupeRefs[0].cnt} duplicates found`);
  }

  // ── Phase 7: API layer ────────────────────────────────────────────────────
  console.log('\n=== PHASE 7: API Layer ===');
  const [settingsSeed] = await pool.query(
    "SELECT setting_value FROM settings WHERE setting_key = 'daily_bonus_amount'"
  );
  if (settingsSeed.length > 0) {
    ok(`daily_bonus_amount setting: ${settingsSeed[0].setting_value}`);
  } else {
    ko('daily_bonus_amount', 'missing from settings table');
  }

  const [betLimits] = await pool.query(
    "SELECT setting_key FROM settings WHERE setting_key IN ('min_bet','max_bet_full','max_bet_30min','max_bet_last_30')"
  );
  if (betLimits.length === 4) {
    ok('All 4 bet limit settings present');
  } else {
    ko('Bet limits', `only ${betLimits.length}/4 present`);
  }

  // ── Check new tables operational ─────────────────────────────────────────
  console.log('\n=== Schema / Migration State ===');
  const [tables] = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = DATABASE()
    AND table_name IN ('fraud_alerts','daily_bonus_claims','admin_activity_logs','settlement_queue')
  `);
  const tableNames = tables.map(t => t.TABLE_NAME || t.table_name);
  for (const t of ['fraud_alerts','daily_bonus_claims','admin_activity_logs','settlement_queue']) {
    if (tableNames.includes(t)) ok(`Table ${t} exists`);
    else ko('Missing table', t);
  }

  const [bonusEnum] = await pool.query(`
    SELECT column_type FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'bonuses' AND column_name = 'type'
  `);
  const enumVal = bonusEnum[0]?.COLUMN_TYPE || bonusEnum[0]?.column_type || '';
  if (enumVal.includes("'daily'")) {
    ok(`bonuses.type ENUM includes 'daily'`);
  } else {
    ko('bonuses.type ENUM', `missing 'daily', got: ${enumVal}`);
  }

  // ── Phase 12: Settlement queue stats ─────────────────────────────────────
  console.log('\n=== PHASE 12: Settlement Queue ===');
  const [sqStats] = await pool.query('SELECT status, COUNT(*) AS count FROM settlement_queue GROUP BY status');
  if (sqStats.length > 0) console.table(sqStats);
  const failedCount = sqStats.find(r => r.status === 'failed')?.count || 0;
  if (failedCount === 0) ok('No failed settlement jobs');
  else ko('Failed settlement jobs', failedCount);

  await pool.end();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  if (fail === 0) {
    console.log('🟢 ALL CHECKS PASSED — SYSTEM PRODUCTION READY');
  } else {
    console.log(`🔴 ${fail} CHECK(S) FAILED — REVIEW ABOVE`);
  }
})();
