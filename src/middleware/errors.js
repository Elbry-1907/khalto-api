const logger = require('../utils/logger');

// 404 handler
const notFound = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  // Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Record already exists', detail: err.detail });
  }
  // Postgres foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found', detail: err.detail });
  }
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired', expired_at: err.expiredAt });
  }
  // Validation errors (from Joi middleware)
  if (err.isJoi) {
    return res.status(422).json({ error: 'Validation failed', details: err.details });
  }

  const status = err.status || err.statusCode || 500;
  logger.error(err.message, {
    stack:     err.stack,
    method:    req.method,
    path:      req.path,
    requestId: req.requestId,
    userId:    req.user?.id,
  });

  res.status(status).json({
    error:   status === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };
