/**
 * Game Timing Utilities — IST-aware, overnight-safe.
 *
 * All functions operate in IST (Asia/Kolkata, UTC+05:30).
 * The Node process should have  process.env.TZ = 'Asia/Kolkata'  set at
 * startup so that  new Date()  already produces IST local values.
 */

// ── helpers ──────────────────────────────────────────────────────────

/** Parse a MySQL TIME value ("HH:MM:SS" or "HH:MM" or {hours,minutes}) */
function parseTime(timeVal) {
  if (timeVal && typeof timeVal === 'object' && 'hours' in timeVal) {
    return { hours: timeVal.hours, minutes: timeVal.minutes || 0 };
  }
  const str = String(timeVal || '00:00:00');
  const parts = str.split(':').map(Number);
  return { hours: parts[0] || 0, minutes: parts[1] || 0 };
}

/** Format "YYYY-MM-DD" from a Date (local) */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return a Date with the given time on a specific date */
function dateAtTime(baseDate, timeObj) {
  const d = new Date(baseDate);
  d.setHours(timeObj.hours, timeObj.minutes, 0, 0);
  return d;
}

// ── public API ───────────────────────────────────────────────────────

/**
 * Detect whether a game is an overnight game.
 * Overnight = close_time < open_time (the game spans midnight).
 */
function isOvernightGame(game) {
  const open = parseTime(game.open_time);
  const close = parseTime(game.close_time);
  return (
    close.hours < open.hours ||
    (close.hours === open.hours && close.minutes < open.minutes)
  );
}

/**
 * For a given result_date, compute the absolute open and close datetimes.
 *
 * result_date is always the date the game *closes* on (DATE(close_time)).
 *
 * Normal game:   open & close are both on result_date.
 * Overnight game: close is on result_date, open is on result_date − 1 day.
 */
function calculateGameDatetimes(game, resultDate) {
  const open = parseTime(game.open_time);
  const close = parseTime(game.close_time);
  const overnight = isOvernightGame(game);

  // resultDate can be a Date or "YYYY-MM-DD" string
  const base = typeof resultDate === 'string' ? new Date(`${resultDate}T00:00:00`) : new Date(resultDate);

  const closeDt = dateAtTime(base, close);
  const openDt = dateAtTime(base, open);

  if (overnight) {
    // Session opened the day before the closing date
    openDt.setDate(openDt.getDate() - 1);
  }

  return { openDatetime: openDt, closeDatetime: closeDt, isOvernight: overnight };
}

/**
 * Compute the result_date for a game given "now" (IST).
 *
 * result_date = DATE(close_time) — the date the session CLOSES on.
 *
 * Normal game (close_time > open_time, same day):
 *   result_date = today.
 *
 * Overnight game (close_time < open_time, spans midnight):
 *   - Evening side: now >= open_time → session closes tomorrow
 *     → result_date = tomorrow
 *   - Early-morning side: now < open_time → session closes today
 *     → result_date = today
 */
function getResultDate(game, now = new Date()) {
  if (!isOvernightGame(game)) {
    return formatDate(now);
  }

  const open = parseTime(game.open_time);
  const openToday = dateAtTime(now, open);

  if (now >= openToday) {
    // Evening side — the session will close tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  // Early-morning side — the session closes today
  return formatDate(now);
}

/**
 * Resolve the current-session open/close window for a game.
 *
 * This is the *betting window* from the user's perspective relative to "now".
 * Correctly handles overnight games before and after midnight.
 */
function resolveGameWindow(game, now = new Date()) {
  const open = parseTime(game.open_time);
  const close = parseTime(game.close_time);
  const overnight = isOvernightGame(game);

  const openDt = dateAtTime(now, open);
  const closeDt = dateAtTime(now, close);

  if (overnight) {
    if (now >= openDt) {
      // Evening side — close is tomorrow
      closeDt.setDate(closeDt.getDate() + 1);
    } else if (now < closeDt) {
      // Early-morning side — open was yesterday
      openDt.setDate(openDt.getDate() - 1);
    } else {
      // Between close and open — next window
      closeDt.setDate(closeDt.getDate() + 1);
    }
  }

  return { openDatetime: openDt, closeDatetime: closeDt, isOvernight: overnight };
}

/**
 * Can a user place a bet right now?
 *
 * Returns { allowed, reason?, minutesLeft?, maxBet? }
 * maxBet is determined from the settings map provided.
 *
 * settingsMap keys: min_bet, max_bet_full, max_bet_30min, max_bet_last_30
 *
 * Tiers:
 *   > 90 min before close → max_bet_full   (full limit)
 *   30–90 min             → max_bet_30min   (medium limit)
 *   < 30 min              → max_bet_last_30 (low limit)
 *   after close           → blocked
 */
function canPlaceBet(game, settingsMap = {}, now = new Date()) {
  const { openDatetime, closeDatetime } = resolveGameWindow(game, now);

  if (now < openDatetime) {
    return {
      allowed: false,
      reason: `Betting opens at ${openDatetime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })} for this game.`,
    };
  }

  if (now >= closeDatetime) {
    return { allowed: false, reason: 'Betting is closed for this game.' };
  }

  const minutesLeft = (closeDatetime - now) / 60000;

  // All limits must come from the settings table — no hardcoded fallbacks.
  // If the caller didn't load settings, reject the bet rather than guess.
  const hasLimits = settingsMap.max_bet_full != null
    || settingsMap.max_bet_30min != null
    || settingsMap.max_bet_last_30 != null;

  if (!hasLimits) {
    return { allowed: false, reason: 'Betting limits not configured. Contact admin.' };
  }

  let maxBet;
  if (minutesLeft > 90) {
    maxBet = settingsMap.max_bet_full ?? settingsMap.max_bet_30min;
  } else if (minutesLeft > 30) {
    maxBet = settingsMap.max_bet_30min ?? settingsMap.max_bet_last_30;
  } else {
    maxBet = settingsMap.max_bet_last_30 ?? settingsMap.max_bet_30min;
  }

  const minBet = settingsMap.min_bet ?? 10;

  return { allowed: true, minutesLeft, maxBet, minBet };
}

/**
 * Can settlement proceed? (has close_datetime passed?)
 *
 * resultDate is the game's result_date string ("YYYY-MM-DD").
 */
function canSettleGame(game, resultDate, now = new Date()) {
  const { closeDatetime } = calculateGameDatetimes(game, resultDate);
  return now >= closeDatetime;
}

/**
 * Is the result visible to end-users?
 *
 * Same logic as canSettleGame — visible only after the close datetime.
 */
function isResultVisible(game, resultDate, now = new Date()) {
  return canSettleGame(game, resultDate, now);
}

module.exports = {
  parseTime,
  formatDate,
  isOvernightGame,
  calculateGameDatetimes,
  getResultDate,
  resolveGameWindow,
  canPlaceBet,
  canSettleGame,
  isResultVisible,
};
