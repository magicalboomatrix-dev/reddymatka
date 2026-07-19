/**
 * Wallet Reconciliation Script (Corrected)
 *
 * Compares wallets.balance and wallets.bonus_balance against the calculated
 * balances from wallet_transactions to detect ledger drift.
 *
 * Usage:
 *   node scripts/reconcile_wallets.js            # Dry-run (report only)
 *   node scripts/reconcile_wallets.js --fix      # Auto-correct drifted balances
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/database');

const FIX_MODE = process.argv.includes('--fix');

async function reconcile() {
  console.log(`\n=== Wallet Reconciliation (${FIX_MODE ? 'FIX MODE' : 'DRY RUN'}) ===\n`);

  // Compute expected balance and bonus balance per user from wallet_transactions.
  // Main balance affects: type != 'bonus' AND reference_type != 'bet_bonus'
  // Bonus balance affects: type = 'bonus' OR reference_type = 'bet_bonus'
  const [rows] = await pool.query(`
    SELECT
      w.user_id,
      w.balance       AS stored_balance,
      w.bonus_balance AS stored_bonus,
      COALESCE(wt.calculated, 0) AS calculated_balance,
      COALESCE(wb.calculated, 0) AS calculated_bonus
    FROM wallets w
    LEFT JOIN (
      SELECT user_id, SUM(amount) AS calculated
      FROM wallet_transactions
      WHERE status = 'completed'
        AND type != 'bonus'
        AND reference_type != 'bet_bonus'
      GROUP BY user_id
    ) wt ON wt.user_id = w.user_id
    LEFT JOIN (
      SELECT user_id, SUM(amount) AS calculated
      FROM wallet_transactions
      WHERE status = 'completed'
        AND (type = 'bonus' OR reference_type = 'bet_bonus')
      GROUP BY user_id
    ) wb ON wb.user_id = w.user_id
  `);

  let driftCount = 0;
  const drifted = [];

  for (const row of rows) {
    const storedBal = parseFloat(row.stored_balance || 0);
    const calculatedBal = parseFloat(row.calculated_balance || 0);
    const storedBonus = parseFloat(row.stored_bonus || 0);
    const calculatedBonus = parseFloat(row.calculated_bonus || 0);

    const balDiff = Math.round((storedBal - calculatedBal) * 100) / 100;
    const bonusDiff = Math.round((storedBonus - calculatedBonus) * 100) / 100;

    if (Math.abs(balDiff) >= 0.01 || Math.abs(bonusDiff) >= 0.01) {
      driftCount++;
      drifted.push({
        user_id: row.user_id,
        stored_balance: storedBal,
        calculated_balance: calculatedBal,
        balance_drift: balDiff,
        stored_bonus: storedBonus,
        calculated_bonus: calculatedBonus,
        bonus_drift: bonusDiff,
      });
    }
  }

  if (drifted.length === 0) {
    console.log(`✅ All ${rows.length} wallets are consistent. No drift detected.\n`);
    process.exit(0);
  }

  console.log(`⚠️  ${driftCount} wallet(s) with balance drift:\n`);
  console.table(drifted);

  if (!FIX_MODE) {
    console.log('\nRun with --fix to auto-correct these balances.');
    console.log('A correction wallet_transaction will be inserted for each drifted wallet.\n');
    process.exit(1);
  }

  // Fix mode — correct each drifted wallet inside a transaction
  const conn = await pool.getConnection();
  let fixed = 0;

  for (const d of drifted) {
    try {
      await conn.beginTransaction();

      // Lock the wallet row
      const [[wallet]] = await conn.query(
        'SELECT balance, bonus_balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [d.user_id]
      );

      if (!wallet) {
        await conn.rollback();
        continue;
      }

      const currentBalance = parseFloat(wallet.balance || 0);
      const currentBonus = parseFloat(wallet.bonus_balance || 0);

      const balCorrection = Math.round((d.calculated_balance - currentBalance) * 100) / 100;
      const bonusCorrection = Math.round((d.calculated_bonus - currentBonus) * 100) / 100;

      if (Math.abs(balCorrection) < 0.01 && Math.abs(bonusCorrection) < 0.01) {
        await conn.rollback();
        continue;
      }

      const newBalance = Math.round((currentBalance + balCorrection) * 100) / 100;
      const newBonus = Math.round((currentBonus + bonusCorrection) * 100) / 100;

      await conn.query(
        'UPDATE wallets SET balance = ?, bonus_balance = ? WHERE user_id = ?',
        [newBalance, newBonus, d.user_id]
      );

      // Record main balance adjustment if needed
      if (Math.abs(balCorrection) >= 0.01) {
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'adjustment', ?, ?, 'completed', 'reconciliation', ?, ?)`,
          [
            d.user_id,
            balCorrection,
            newBalance,
            `reconciliation_bal_${d.user_id}_${Date.now()}`,
            `System balance adjustment / सिस्टम बैलेंस समायोजन`,
          ]
        );
      }

      // Record bonus balance adjustment if needed
      if (Math.abs(bonusCorrection) >= 0.01) {
        const effectiveBalance = newBalance + newBonus;
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'bonus', ?, ?, 'completed', 'reconciliation_bonus', ?, ?)`,
          [
            d.user_id,
            bonusCorrection,
            effectiveBalance,
            `reconciliation_bonus_${d.user_id}_${Date.now()}`,
            `System bonus adjustment / सिस्टम बोनस समायोजन`,
          ]
        );
      }

      await conn.commit();
      fixed++;
      console.log(`  Fixed user #${d.user_id}: balance ${currentBalance} → ${newBalance}, bonus ${currentBonus} → ${newBonus}`);
    } catch (err) {
      await conn.rollback();
      console.error(`  Error fixing user #${d.user_id}:`, err.message);
    }
  }

  conn.release();
  console.log(`\n✅ Fixed ${fixed}/${driftCount} wallets.\n`);
  process.exit(fixed === driftCount ? 0 : 1);
}

reconcile()
  .catch((err) => {
    console.error('Reconciliation failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
