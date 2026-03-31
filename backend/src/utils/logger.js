/**
 * Structured Logger
 * Provides JSON-formatted logging with severity levels for production monitoring.
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function formatLog(level, context, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
  };
  if (data !== undefined) {
    if (data instanceof Error) {
      entry.error = { message: data.message, stack: data.stack };
    } else {
      entry.data = data;
    }
  }
  return JSON.stringify(entry);
}

function shouldLog(level) {
  return (LOG_LEVELS[level] ?? 2) <= CURRENT_LEVEL;
}

const logger = {
  error(context, message, data) {
    if (shouldLog('error')) console.error(formatLog('error', context, message, data));
  },
  warn(context, message, data) {
    if (shouldLog('warn')) console.warn(formatLog('warn', context, message, data));
  },
  info(context, message, data) {
    if (shouldLog('info')) console.log(formatLog('info', context, message, data));
  },
  debug(context, message, data) {
    if (shouldLog('debug')) console.log(formatLog('debug', context, message, data));
  },
};

module.exports = logger;
