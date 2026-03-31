const { recordWalletTransaction } = require('./wallet-ledger');

/**
 * Load payout multipliers from the game_payout_rates table.
 * Throws if the table is empty — settlement must not proceed with unknown rates.
 */
async function loadPayoutRates(conn) {
  const [rates] = await conn.query('SELECT game_type, multiplier FROM game_payout_rates');

  if (rates.length === 0) {
    throw new Error('No payout rates configured in game_payout_rates table. Run the migration first.');
  }

  const payouts = {};
  for (const r of rates) {
    payouts[r.game_type] = parseFloat(r.multiplier);
  }

  const required = ['jodi', 'haruf_andar', 'haruf_bahar', 'crossing'];
  for (const type of required) {
    if (payouts[type] == null) {
      throw new Error(`Missing payout rate for "${type}" in game_payout_rates table.`);
    }
  }

  return payouts;
}

/**
 * Load bonus multipliers from the game_bonus_rates table.
 * Returns { jodi, haruf_andar, haruf_bahar, crossing } — default 1.00 (no bonus).
 */
async function loadBonusRates(conn) {
  const [rows] = await conn.query('SELECT game_type, bonus_multiplier FROM game_bonus_rates');
  const bonus = {};
  for (const r of rows) {
    bonus[r.game_type] = parseFloat(r.bonus_multiplier);
  }
  return {
    jodi: bonus.jodi ?? 1,
    haruf_andar: bonus.haruf_andar ?? 1,
    haruf_bahar: bonus.haruf_bahar ?? 1,
    crossing: bonus.crossing ?? 1,
  };
}

/**
 * Settle all pending bets for a given game using the provided result string.
 * Must be called within an existing transaction (conn).
 *
 * IMPORTANT: Does NOT filter by DATE(created_at). Filters only by
 *   bets.game_id AND bets.status = 'pending'
 * The result_id links the bet to the correct game_result row.
 *
 * Returns the number of bets settled.
 */
async function settleBetsForGame(conn, gameId, resultStr, resultId) {
  const [pendingBets] = await conn.query(
    `SELECT b.*, bn.number, bn.amount as number_amount, bn.id as bn_id
     FROM bets b
     JOIN bet_numbers bn ON b.id = bn.bet_id
     WHERE b.game_id = ? AND b.status = 'pending'`,
    [gameId]
  );

  if (pendingBets.length === 0) return 0;

  const payouts = await loadPayoutRates(conn);
  const bonus = await loadBonusRates(conn);

  // Group bet numbers by bet_id
  const betGroups = {};
  for (const row of pendingBets) {
    if (!betGroups[row.id]) {
      betGroups[row.id] = { ...row, numbers: [] };
    }
    betGroups[row.id].numbers.push({ number: row.number, amount: parseFloat(row.number_amount) });
  }

  const resultFirstDigit = resultStr.slice(0, 1);
  const resultLastDigit = resultStr.slice(-1);
  let settledCount = 0;

  for (const betId of Object.keys(betGroups)) {
    const bet = betGroups[betId];
    let totalWin = 0;

    for (const num of bet.numbers) {
      let isWin = false;

      if (bet.type === 'jodi') {
        isWin = num.number === resultStr;
        if (isWin) totalWin += num.amount * payouts.jodi * bonus.jodi;
      } else if (bet.type === 'haruf_andar') {
        isWin = num.number === resultFirstDigit;
        if (isWin) totalWin += num.amount * payouts.haruf_andar * bonus.haruf_andar;
      } else if (bet.type === 'haruf_bahar') {
        isWin = num.number === resultLastDigit;
        if (isWin) totalWin += num.amount * payouts.haruf_bahar * bonus.haruf_bahar;
      } else if (bet.type === 'crossing') {
        isWin = num.number === resultStr;
        if (isWin) totalWin += num.amount * payouts.crossing * bonus.crossing;
      }
    }

    // Round to 2 decimal places to avoid floating point drift
    totalWin = Math.round(totalWin * 100) / 100;

    const status = totalWin > 0 ? 'win' : 'loss';
    await conn.query(
      'UPDATE bets SET status = ?, win_amount = ?, game_result_id = ?, settled_at = NOW() WHERE id = ?',
      [status, totalWin, resultId, betId]
    );

    if (totalWin > 0) {
      await recordWalletTransaction(conn, {
        userId: bet.user_id,
        type: 'win',
        amount: totalWin,
        referenceType: 'bet',
        referenceId: `bet_${betId}`,
        remark: `Won on ${bet.type} bet`,
      });

      // Notification sent ONLY to the specific bet owner
      await conn.query(
        'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
        [bet.user_id, 'win', `Congratulations! You won ₹${totalWin.toLocaleString('en-IN')} on your ${bet.type} bet!`]
      );
    }

    settledCount++;
  }

  return settledCount;
}

module.exports = { settleBetsForGame, loadPayoutRates, loadBonusRates };
