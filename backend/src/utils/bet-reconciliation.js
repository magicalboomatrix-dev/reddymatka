const pool = require('../config/database');
const { recordWalletTransaction } = require('./wallet-ledger');
const logger = require('./logger');

const DEFAULT_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 100;

let reconciliationIntervalId = null;

function roundCurrency(value) {
  return Math.round((parseFloat(value || 0) || 0) * 100) / 100;
}

function isDbConnection(value) {
  return value && typeof value.query === 'function';
}

function getBetBaseReference(betId) {
  return `bet_${betId}`;
}

function getBetCreditReference(betId, sequence) {
  return `${getBetBaseReference(betId)}_credit_${sequence}`;
}

function buildBetReferencePatterns(betId) {
  const baseReference = getBetBaseReference(betId);
  return {
    baseReference,
    creditPattern: `${baseReference}_credit_%`,
    reversedPattern: `${baseReference}_reversed_%`,
    legacyFixPattern: `win_credit_fix_${betId}_%`,
    reversalPattern: `bet_reversal_${betId}_%`,
  };
}

async function getBetCreditSummary(conn, betId) {
  const patterns = buildBetReferencePatterns(betId);
  const [rows] = await conn.query(
    `SELECT
        COALESCE(SUM(CASE
          WHEN wt.type = 'win'
           AND wt.reference_type = 'bet'
           AND (
             wt.reference_id = ?
             OR wt.reference_id LIKE ?
             OR wt.reference_id LIKE ?
             OR wt.reference_id LIKE ?
           )
          THEN wt.amount
          ELSE 0
        END), 0) AS credited_amount,
        COALESCE(SUM(CASE
          WHEN wt.reference_type = 'bet_reversal'
           AND wt.reference_id LIKE ?
          THEN wt.amount
          ELSE 0
        END), 0) AS reversal_amount,
        COALESCE(SUM(CASE
          WHEN (
            wt.type = 'win'
            AND wt.reference_type = 'bet'
            AND (
              wt.reference_id = ?
              OR wt.reference_id LIKE ?
              OR wt.reference_id LIKE ?
              OR wt.reference_id LIKE ?
            )
          )
          OR (
            wt.reference_type = 'bet_reversal'
            AND wt.reference_id LIKE ?
          )
          THEN wt.amount
          ELSE 0
        END), 0) AS net_credited
      FROM wallet_transactions wt
      WHERE wt.status = 'completed'
        AND wt.reference_type IN ('bet', 'bet_reversal')
        AND (
          wt.reference_id = ?
          OR wt.reference_id LIKE ?
          OR wt.reference_id LIKE ?
          OR wt.reference_id LIKE ?
          OR wt.reference_id LIKE ?
        )`,
    [
      patterns.baseReference,
      patterns.creditPattern,
      patterns.reversedPattern,
      patterns.legacyFixPattern,
      patterns.reversalPattern,
      patterns.baseReference,
      patterns.creditPattern,
      patterns.reversedPattern,
      patterns.legacyFixPattern,
      patterns.reversalPattern,
      patterns.baseReference,
      patterns.creditPattern,
      patterns.reversedPattern,
      patterns.legacyFixPattern,
      patterns.reversalPattern,
    ]
  );

  return {
    creditedAmount: roundCurrency(rows[0]?.credited_amount),
    reversalAmount: roundCurrency(rows[0]?.reversal_amount),
    netCredited: roundCurrency(rows[0]?.net_credited),
  };
}

async function getNextBetCreditSequence(conn, betId) {
  const patterns = buildBetReferencePatterns(betId);
  const [rows] = await conn.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(reference_id, '_credit_', -1) AS UNSIGNED)), 0) AS max_sequence
     FROM wallet_transactions
     WHERE type = 'win'
       AND reference_type = 'bet'
       AND reference_id LIKE ?`,
    [patterns.creditPattern]
  );

  return Number(rows[0]?.max_sequence || 0) + 1;
}

async function renameBetSettlementReferences(conn, betId, revisionTs) {
  const patterns = buildBetReferencePatterns(betId);
  const suffix = `_reversed_${revisionTs}`;

  const [result] = await conn.query(
    `UPDATE wallet_transactions
        SET reference_id = CONCAT(reference_id, ?)
      WHERE status = 'completed'
        AND type = 'win'
        AND reference_type = 'bet'
        AND (
          reference_id = ?
          OR reference_id LIKE ?
          OR reference_id LIKE ?
        )
        AND reference_id NOT LIKE ?`,
    [
      suffix,
      patterns.baseReference,
      patterns.creditPattern,
      patterns.legacyFixPattern,
      '%_reversed_%',
    ]
  );

  return result.affectedRows || 0;
}

async function reconcileWalletForBet(connOrBetId, betIdOrOptions, maybeOptions = {}) {
  const ownsConnection = !isDbConnection(connOrBetId);
  const conn = ownsConnection ? await pool.getConnection() : connOrBetId;
  const betId = ownsConnection ? connOrBetId : betIdOrOptions;
  const options = ownsConnection ? (betIdOrOptions || {}) : maybeOptions;

  try {
    if (ownsConnection) {
      await conn.beginTransaction();
    }

    const [bets] = await conn.query(
      `SELECT b.id, b.user_id, b.status, b.win_amount, b.type, g.name AS game_name
       FROM bets b
       LEFT JOIN games g ON g.id = b.game_id
       WHERE b.id = ?
       FOR UPDATE`,
      [betId]
    );

    if (bets.length === 0) {
      throw new Error(`Bet ${betId} not found.`);
    }

    const bet = bets[0];
    const expectedCredit = roundCurrency(
      Object.prototype.hasOwnProperty.call(options, 'expectedCredit')
        ? options.expectedCredit
        : bet.win_amount
    );
    const summary = await getBetCreditSummary(conn, bet.id);
    const shortfall = roundCurrency(expectedCredit - summary.netCredited);

    if (Math.abs(shortfall) >= 0.01) {
      logger.warn('bet-reconcile', 'Bet wallet credit drift detected', {
        bet_id: bet.id,
        user_id: bet.user_id,
        expected_credit: expectedCredit,
        credited_amount: summary.netCredited,
        shortfall,
      });
    }

    if (bet.status !== 'win' || expectedCredit <= 0) {
      if (ownsConnection) {
        await conn.commit();
      }
      return {
        betId: bet.id,
        userId: bet.user_id,
        expectedCredit,
        creditedAmount: summary.netCredited,
        shortfall,
        creditedDelta: 0,
        action: 'skipped_not_win',
      };
    }

    if (shortfall <= 0) {
      if (shortfall < -0.01) {
        logger.error('bet-reconcile', 'Bet is over-credited', {
          bet_id: bet.id,
          user_id: bet.user_id,
          expected_credit: expectedCredit,
          credited_amount: summary.netCredited,
          shortfall,
        });
      }

      if (ownsConnection) {
        await conn.commit();
      }
      return {
        betId: bet.id,
        userId: bet.user_id,
        expectedCredit,
        creditedAmount: summary.netCredited,
        shortfall,
        creditedDelta: 0,
        action: 'already_credited',
      };
    }

    const nextSequence = await getNextBetCreditSequence(conn, bet.id);
    const referenceId = getBetCreditReference(bet.id, nextSequence);
    const remark = options.remark || `Won on ${bet.type} bet${shortfall < expectedCredit ? ' (reconciliation delta)' : ''}`;

    const newBalance = await recordWalletTransaction(conn, {
      userId: bet.user_id,
      type: 'win',
      amount: shortfall,
      referenceType: 'bet',
      referenceId,
      remark,
    });

    logger.info('bet-reconcile', 'Applied missing win credit', {
      bet_id: bet.id,
      user_id: bet.user_id,
      credited_delta: shortfall,
      expected_credit: expectedCredit,
      credited_before: summary.netCredited,
      credited_after: roundCurrency(summary.netCredited + shortfall),
      reference_id: referenceId,
    });

    if (ownsConnection) {
      await conn.commit();
    }

    return {
      betId: bet.id,
      userId: bet.user_id,
      expectedCredit,
      creditedAmount: summary.netCredited,
      shortfall,
      creditedDelta: shortfall,
      newBalance,
      referenceId,
      action: 'credited_delta',
    };
  } catch (error) {
    if (ownsConnection) {
      try { await conn.rollback(); } catch (_) { /* ignore rollback errors */ }
    }
    throw error;
  } finally {
    if (ownsConnection) {
      conn.release();
    }
  }
}

async function findDriftedWinningBetIds(limit = DEFAULT_BATCH_LIMIT) {
  const [rows] = await pool.query(
    `SELECT b.id
     FROM bets b
     LEFT JOIN (
       SELECT
         CAST(CASE
           WHEN reference_id LIKE 'bet_reversal_%' THEN SUBSTRING_INDEX(SUBSTRING(reference_id, 14), '_', 1)
           WHEN reference_id LIKE 'win_credit_fix_%' THEN SUBSTRING_INDEX(SUBSTRING(reference_id, 16), '_', 1)
           WHEN reference_id LIKE 'bet_%' THEN SUBSTRING_INDEX(SUBSTRING(reference_id, 5), '_', 1)
           ELSE NULL
         END AS UNSIGNED) AS bet_id,
         SUM(amount) AS net_credited
       FROM wallet_transactions
       WHERE status = 'completed'
         AND (
           (reference_type = 'bet' AND type = 'win')
           OR reference_type = 'bet_reversal'
         )
       GROUP BY bet_id
     ) wt ON b.id = wt.bet_id
     WHERE b.status = 'win'
       AND b.win_amount > 0
       AND ABS(b.win_amount - COALESCE(wt.net_credited, 0)) >= 0.01
     ORDER BY COALESCE(b.settled_at, b.created_at) ASC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => row.id);
}

async function reconcileOutstandingWinningBets(limit = DEFAULT_BATCH_LIMIT) {
  const betIds = await findDriftedWinningBetIds(limit);

  if (betIds.length === 0) {
    return { scanned: 0, fixed: 0, betIds: [] };
  }

  let fixed = 0;
  for (const betId of betIds) {
    const result = await reconcileWalletForBet(betId);
    if (result.creditedDelta > 0) {
      fixed++;
    }
  }

  logger.info('bet-reconcile', 'Periodic bet reconciliation completed', {
    scanned: betIds.length,
    fixed,
  });

  return { scanned: betIds.length, fixed, betIds };
}

function startBetReconciliationWorker(intervalMs = DEFAULT_RECONCILIATION_INTERVAL_MS, batchSize = DEFAULT_BATCH_LIMIT) {
  if (reconciliationIntervalId) {
    return;
  }

  logger.info('bet-reconcile', `Background reconciliation started — checking every ${intervalMs / 1000}s`, {
    batchSize,
  });

  const tick = async () => {
    try {
      await reconcileOutstandingWinningBets(batchSize);
    } catch (error) {
      logger.error('bet-reconcile', 'Background reconciliation failed', error);
    }
  };

  tick();
  reconciliationIntervalId = setInterval(tick, intervalMs);
}

function stopBetReconciliationWorker() {
  if (reconciliationIntervalId) {
    clearInterval(reconciliationIntervalId);
    reconciliationIntervalId = null;
  }
}

module.exports = {
  getBetBaseReference,
  getBetCreditReference,
  getBetCreditSummary,
  reconcileWalletForBet,
  renameBetSettlementReferences,
  reconcileOutstandingWinningBets,
  startBetReconciliationWorker,
  stopBetReconciliationWorker,
};