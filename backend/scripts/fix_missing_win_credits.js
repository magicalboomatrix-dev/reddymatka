/**
 * Fix Missing Win Credits
 *
 * After a result revision (re-declaration), bets can end up with status='win'
 * but no corresponding wallet credit — because the idempotency guard in
 * recordWalletTransaction blocked the second credit (the original reference_id
 * still existed even though a reversal had been applied).
 *
 * This script:
 * 1. Finds all bets with status='win' and win_amount > 0
 * 2. Checks if the NET wallet impact for that bet is correct
 *    (original credit minus any reversals should equal win_amount)
 * 3. If missing/short, inserts the corrective wallet credit
 *
 * Usage:
 *   node scripts/fix_missing_win_credits.js            # Dry-run
 *   node scripts/fix_missing_win_credits.js --fix       # Apply corrections
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/database');

const FIX_MODE = process.argv.includes('--fix');

async function main() {
  console.log(`\n=== Fix Missing Win Credits (${FIX_MODE ? 'FIX MODE' : 'DRY RUN'}) ===\n`);

  // Find all won bets
  const [wonBets] = await pool.query(`
    SELECT b.id, b.user_id, b.win_amount, b.type, b.game_id, b.session_date,
           g.name AS game_name
    FROM bets b
    LEFT JOIN games g ON g.id = b.game_id
    WHERE b.status = 'win' AND b.win_amount > 0
    ORDER BY b.settled_at DESC
  `);

  console.log(`Found ${wonBets.length} won bet(s) to check.\n`);

  const missing = [];

  for (const bet of wonBets) {
    // Sum only WIN credits and reversal adjustments for this bet.
    // Excludes bet placement stake deductions (type='bet') which are unrelated.
    const [[txnResult]] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS net_amount
      FROM wallet_transactions
      WHERE status = 'completed'
        AND (
          (type = 'win' AND reference_type = 'bet' AND (reference_id = ? OR reference_id LIKE ? OR reference_id LIKE ?))
          OR
          (reference_type = 'bet_reversal' AND reference_id LIKE ?)
        )
    `, [`bet_${bet.id}`, `bet_${bet.id}_reversed_%`, `win_credit_fix_${bet.id}_%`, `bet_reversal_${bet.id}_%`]);

    const netCredited = parseFloat(txnResult.net_amount);
    const expectedWin = parseFloat(bet.win_amount);
    const shortfall = Math.round((expectedWin - netCredited) * 100) / 100;

    if (shortfall >= 0.01) {
      missing.push({
        bet_id: bet.id,
        user_id: bet.user_id,
        game: bet.game_name || bet.game_id,
        bet_type: bet.type,
        session_date: bet.session_date,
        win_amount: expectedWin,
        net_credited: netCredited,
        shortfall,
      });
    }
  }

  if (missing.length === 0) {
    console.log('✅ All won bets have correct wallet credits. Nothing to fix.\n');
    process.exit(0);
  }

  console.log(`⚠️  ${missing.length} bet(s) with missing wallet credits:\n`);
  console.table(missing);

  if (!FIX_MODE) {
    console.log('\nDry run — no changes made. Run with --fix to credit missing amounts.');
    process.exit(0);
  }

  // Fix each missing credit inside a transaction
  const conn = await pool.getConnection();
  let fixed = 0;

  for (const m of missing) {
    try {
      await conn.beginTransaction();

      // Lock wallet row
      const [[wallet]] = await conn.query(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [m.user_id]
      );

      if (!wallet) {
        console.error(`  ❌ No wallet for user #${m.user_id}, skipping bet #${m.bet_id}`);
        await conn.rollback();
        continue;
      }

      const currentBalance = parseFloat(wallet.balance || 0);
      const newBalance = Math.round((currentBalance + m.shortfall) * 100) / 100;
      const refId = `win_credit_fix_${m.bet_id}_${Date.now()}`;

      await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [newBalance, m.user_id]);

      await conn.query(
        `INSERT INTO wallet_transactions
          (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
         VALUES (?, 'win', ?, ?, 'completed', 'bet', ?, ?)`,
        [
          m.user_id,
          m.shortfall,
          newBalance,
          refId,
          `Missing win credit fix — bet #${m.bet_id} (${m.bet_type} on ${m.game})`,
        ]
      );

      await conn.commit();
      fixed++;
      console.log(`  ✅ User #${m.user_id}: ₹${currentBalance} → ₹${newBalance} (+₹${m.shortfall}) — bet #${m.bet_id}`);
    } catch (err) {
      await conn.rollback();
      console.error(`  ❌ Error fixing bet #${m.bet_id}:`, err.message);
    }
  }

  conn.release();
  console.log(`\n✅ Fixed ${fixed}/${missing.length} missing credits.\n`);
  process.exit(fixed === missing.length ? 0 : 1);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
