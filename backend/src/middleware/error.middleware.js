const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error('http', `${req.method} ${req.originalUrl} → ${statusCode}`, {
      message: err.message,
      stack: err.stack,
    });
  }

  if (err.type === 'validation') {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry.' });
  }

  const message = statusCode < 500 ? err.message : 'Internal server error';
  res.status(statusCode).json({ error: message });
};

module.exports = { errorHandler };
