'use strict';

require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';

const pool = require('../config/database');
const { settleBetsForGame, reverseSettlement } = require('../utils/settle-bets');
const { getBetCreditSummary, reconcileWalletForBet } = require('../utils/bet-reconciliation');

const results = [];

function roundCurrency(value) {
  return Math.round((parseFloat(value || 0) || 0) * 100) / 100;
}

function record(name, passed, detail = null) {
  results.push({ name, passed, detail });
  const symbol = passed ? 'PASS' : 'FAIL';
  console.log(`${symbol} ${name}`);
  if (!passed && detail) {
    console.log(`  ${detail}`);
  }
}

async function ensureRates(conn) {
  const payoutRows = [
    ['jodi', 9],
    ['haruf_andar', 9],
    ['haruf_bahar', 9],
    ['crossing', 95],
  ];
  const bonusRows = [
    ['jodi', 1],
    ['haruf_andar', 1],
    ['haruf_bahar', 1],
    ['crossing', 1],
  ];

  for (const [gameType, multiplier] of payoutRows) {
    await conn.query(
      `INSERT INTO game_payout_rates (game_type, multiplier)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE multiplier = VALUES(multiplier), updated_at = NOW()`,
      [gameType, multiplier]
    );
  }

  for (const [gameType, bonusMultiplier] of bonusRows) {
    await conn.query(
      `INSERT INTO game_bonus_rates (game_type, bonus_multiplier)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE bonus_multiplier = VALUES(bonus_multiplier), updated_at = NOW()`,
      [gameType, bonusMultiplier]
    );
  }
}

async function createUser(conn, suffix) {
  const [result] = await conn.query(
    `INSERT INTO users (name, phone, role, is_deleted)
     VALUES (?, ?, 'user', 0)`,
    [`_SETTLEMENT_TEST_${suffix}`, `${Date.now().toString().slice(-8)}${String(suffix).padStart(2, '0')}`]
  );

  await conn.query(
    'INSERT INTO wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)',
    [result.insertId]
  );

  return result.insertId;
}

async function createGame(conn, suffix) {
  const [result] = await conn.query(
    `INSERT INTO games (name, open_time, close_time, result_time, is_overnight, is_active)
     VALUES (?, '08:00:00', '17:00:00', '17:00:00', 0, 1)`,
    [`_SETTLEMENT_GAME_${suffix}_${Date.now()}`]
  );
  return result.insertId;
}

async function createWinningBetFixture(conn, suffix) {
  const userId = await createUser(conn, suffix);
  const gameId = await createGame(conn, suffix);
  const sessionDate = '2026-04-08';

  const [betResult] = await conn.query(
    `INSERT INTO bets (user_id, game_id, type, total_amount, session_date)
     VALUES (?, ?, 'jodi', 100.00, ?)`,
    [userId, gameId, sessionDate]
  );

  await conn.query(
    `INSERT INTO bet_numbers (bet_id, number, amount)
     VALUES (?, '07', 100.00)`,
    [betResult.insertId]
  );

  const [resultRow] = await conn.query(
    `INSERT INTO game_results (game_id, result_number, result_date, declared_at, is_settled)
     VALUES (?, '07', ?, NOW(), 0)`,
    [gameId, sessionDate]
  );

  const [[game]] = await conn.query('SELECT * FROM games WHERE id = ?', [gameId]);

  return {
    betId: betResult.insertId,
    userId,
    gameId,
    resultId: resultRow.insertId,
    sessionDate,
    game,
  };
}

async function countBetWinCredits(conn, betId) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM wallet_transactions
     WHERE type = 'win'
       AND reference_type = 'bet'
       AND (
         reference_id = ?
         OR reference_id LIKE ?
         OR reference_id LIKE ?
         OR reference_id LIKE ?
       )`,
    [`bet_${betId}`, `bet_${betId}_credit_%`, `bet_${betId}_reversed_%`, `win_credit_fix_${betId}_%`]
  );

  return Number(row.cnt || 0);
}

async function testNormalWin(conn) {
  const fixture = await createWinningBetFixture(conn, 1);
  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const [[bet]] = await conn.query('SELECT status, win_amount FROM bets WHERE id = ?', [fixture.betId]);
  const summary = await getBetCreditSummary(conn, fixture.betId);
  const creditRows = await countBetWinCredits(conn, fixture.betId);

  const passed = bet.status === 'win'
    && roundCurrency(bet.win_amount) === 900
    && summary.netCredited === 900
    && creditRows === 1;

  record('normal win credits wallet exactly once', passed, JSON.stringify({ bet, summary, creditRows }));
}

async function testRedeclareResult(conn) {
  const fixture = await createWinningBetFixture(conn, 2);
  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const reverseResult = await reverseSettlement(conn, fixture.resultId);
  const afterReverse = await getBetCreditSummary(conn, fixture.betId);
  const [[reversedBet]] = await conn.query('SELECT status, win_amount FROM bets WHERE id = ?', [fixture.betId]);
  const [[archivedCredit]] = await conn.query(
    `SELECT reference_id FROM wallet_transactions
     WHERE type = 'win'
       AND reference_type = 'bet'
       AND reference_id LIKE ?
     ORDER BY id DESC
     LIMIT 1`,
    [`bet_${fixture.betId}%_reversed_%`]
  );

  await conn.query('UPDATE game_results SET is_settled = 0, result_number = ? WHERE id = ?', ['07', fixture.resultId]);
  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const afterResettle = await getBetCreditSummary(conn, fixture.betId);
  const creditRows = await countBetWinCredits(conn, fixture.betId);

  const passed = reverseResult.reversedCount === 1
    && reversedBet.status === 'pending'
    && roundCurrency(reversedBet.win_amount) === 0
    && afterReverse.netCredited === 0
    && Boolean(archivedCredit)
    && afterResettle.netCredited === 900
    && creditRows === 2;

  record('re-declare reverses net credit and re-settlement re-credits correctly', passed, JSON.stringify({ reverseResult, afterReverse, afterResettle, creditRows, archivedCredit }));
}

async function testPartialCredit(conn) {
  const fixture = await createWinningBetFixture(conn, 3);

  await conn.query('UPDATE wallets SET balance = 400.00 WHERE user_id = ?', [fixture.userId]);
  await conn.query(
    `INSERT INTO wallet_transactions
      (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
     VALUES (?, 'win', 400.00, 400.00, 'completed', 'bet', ?, 'partial pre-credit')`,
    [fixture.userId, 'bet_' + fixture.betId + '_credit_1']
  );

  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const summary = await getBetCreditSummary(conn, fixture.betId);
  const [[wallet]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [fixture.userId]);
  const creditRows = await countBetWinCredits(conn, fixture.betId);

  const passed = summary.netCredited === 900
    && roundCurrency(wallet.balance) === 900
    && creditRows === 2;

  record('partial pre-credit settles only the remaining delta', passed, JSON.stringify({ summary, wallet, creditRows }));
}

async function testDuplicateSettlementAttempt(conn) {
  const fixture = await createWinningBetFixture(conn, 4);
  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const beforeCount = await countBetWinCredits(conn, fixture.betId);
  const duplicateAttempt = await reconcileWalletForBet(conn, fixture.betId, { expectedCredit: 900 });
  const afterCount = await countBetWinCredits(conn, fixture.betId);
  const summary = await getBetCreditSummary(conn, fixture.betId);

  const passed = duplicateAttempt.creditedDelta === 0
    && duplicateAttempt.action === 'already_credited'
    && beforeCount === afterCount
    && summary.netCredited === 900;

  record('duplicate settlement attempt does not double-credit', passed, JSON.stringify({ duplicateAttempt, beforeCount, afterCount, summary }));
}

async function testNegativeWalletRecovery(conn) {
  const fixture = await createWinningBetFixture(conn, 5);

  await conn.query('UPDATE wallets SET balance = -1200.00 WHERE user_id = ?', [fixture.userId]);

  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  const summary = await getBetCreditSummary(conn, fixture.betId);
  const [[wallet]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [fixture.userId]);

  const passed = summary.netCredited === 900 && roundCurrency(wallet.balance) === -300;

  record('missing win credit can recover a wallet that is already negative', passed, JSON.stringify({ summary, wallet }));
}

async function testReversalNegativeWallet(conn) {
  const fixture = await createWinningBetFixture(conn, 6);
  await settleBetsForGame(conn, fixture.gameId, '07', fixture.resultId, fixture.game, fixture.sessionDate);

  // Spend/withdraw winnings, so wallet balance becomes 0 (before reversal)
  await conn.query('UPDATE wallets SET balance = 0.00 WHERE user_id = ?', [fixture.userId]);

  // Try to reverse settlement (which should deduct 900 and result in wallet balance -900)
  const reverseResult = await reverseSettlement(conn, fixture.resultId);
  const afterReverse = await getBetCreditSummary(conn, fixture.betId);
  const [[wallet]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [fixture.userId]);

  const passed = reverseResult.reversedCount === 1
    && afterReverse.netCredited === 0
    && roundCurrency(wallet.balance) === -900;

  record('reversal succeeds and balance goes negative when wallet has insufficient funds', passed, JSON.stringify({ reverseResult, afterReverse, wallet }));
}

async function main() {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await ensureRates(conn);

    await testNormalWin(conn);
    await testRedeclareResult(conn);
    await testPartialCredit(conn);
    await testDuplicateSettlementAttempt(conn);
    await testNegativeWalletRecovery(conn);
    await testReversalNegativeWallet(conn);

    await conn.rollback();
  } catch (error) {
    try { await conn.rollback(); } catch (_) { /* ignore rollback errors */ }
    console.error(`FATAL ${error.message}`);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FATAL ${error.message}`);
  process.exit(1);
});