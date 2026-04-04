require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // ── Phase 6: Wallet Ledger Reconciliation ─────────────────────────────────
  console.log('\n=== Wallet Ledger Reconciliation ===');
  const [recon] = await c.query(`
    SELECT
      w.user_id,
      ROUND(w.balance, 2)                         AS wallet_balance,
      ROUND(COALESCE(SUM(t.amount), 0), 2)         AS ledger_sum,
      ROUND(w.balance - COALESCE(SUM(t.amount), 0), 2) AS drift
    FROM wallets w
    LEFT JOIN wallet_transactions t ON t.user_id = w.user_id
    GROUP BY w.user_id
    HAVING ABS(drift) > 0.01
    LIMIT 20
  `);
  if (recon.length === 0) {
    console.log('✅ All wallets balance matches ledger sum (no drift > ₹0.01)');
  } else {
    console.warn('⚠️  Wallet drift detected:');
    console.table(recon);
  }

  // ── Phase 5: Settlement Pipeline ─────────────────────────────────────────
  console.log('\n=== Settlement Queue Status ===');
  const [queueStats] = await c.query(`
    SELECT status, COUNT(*) AS count FROM settlement_queue GROUP BY status
  `);
  console.table(queueStats);

  const [failedJobs] = await c.query(`
    SELECT sq.id, sq.game_id, g.name, sq.result_date, sq.attempts, sq.error_message
    FROM settlement_queue sq JOIN games g ON g.id = sq.game_id
    WHERE sq.status = 'failed'
    LIMIT 10
  `);
  if (failedJobs.length > 0) {
    console.warn('⚠️  Failed settlement jobs:');
    console.table(failedJobs);
  } else {
    console.log('✅ No failed settlement jobs');
  }

  const [unsettledBets] = await c.query(`
    SELECT b.game_id, g.name, gr.result_date, COUNT(*) AS pending_bets
    FROM bets b
    JOIN games g ON g.id = b.game_id
    JOIN game_results gr ON gr.game_id = b.game_id
      AND gr.result_date = b.session_date
      AND gr.is_settled = 1
    WHERE b.status = 'pending'
    GROUP BY b.game_id, g.name, gr.result_date
    LIMIT 10
  `);
  if (unsettledBets.length > 0) {
    console.warn('⚠️  Settled games with orphaned pending bets:');
    console.table(unsettledBets);
  } else {
    console.log('✅ No orphaned pending bets on settled game results');
  }

  // ── Phase 6: Transaction integrity ───────────────────────────────────────
  console.log('\n=== Duplicate wallet_transactions references ===');
  const [dupeRefs] = await c.query(`
    SELECT reference_type, reference_id, COUNT(*) AS cnt
    FROM wallet_transactions
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
    GROUP BY reference_type, reference_id
    HAVING cnt > 1
    LIMIT 10
  `);
  if (dupeRefs.length > 0) {
    console.warn('⚠️  Duplicate reference entries (idempotency breach):');
    console.table(dupeRefs);
  } else {
    console.log('✅ No duplicate reference entries — idempotency intact');
  }

  // ── Daily bonus claims integrity ─────────────────────────────────────────
  console.log('\n=== Daily bonus claim stats ===');
  const [bonusStats] = await c.query(`
    SELECT claim_date, COUNT(*) AS claims, SUM(amount) AS total_credited
    FROM daily_bonus_claims
    GROUP BY claim_date
    ORDER BY claim_date DESC
    LIMIT 5
  `);
  if (bonusStats.length > 0) console.table(bonusStats);
  else console.log('(no claims yet)');

  // ── Admin activity log stats ─────────────────────────────────────────────
  console.log('\n=== Admin activity log stats ===');
  const [activityStats] = await c.query(`
    SELECT action, COUNT(*) AS count
    FROM admin_activity_logs
    GROUP BY action
    ORDER BY count DESC
    LIMIT 10
  `);
  if (activityStats.length > 0) console.table(activityStats);
  else console.log('(no admin activity recorded yet)');

  await c.end();
})();
