const errorHandler = (err, req, res, _next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  if (err.type === 'validation') {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry.' });
  }

  const statusCode = err.statusCode || 500;
  let message;
  if (statusCode < 500) {
    // Always show real error message for client errors
    message = err.message;
  } else {
    // Hide internal details in production for server errors
    message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;
  }
  res.status(statusCode).json({ error: message });
};

module.exports = { errorHandler };
