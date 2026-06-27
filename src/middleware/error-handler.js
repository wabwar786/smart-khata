const { ApiError } = require('../utils/api-error');

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Duplicate record already exists.',
      details: process.env.NODE_ENV === 'production' ? undefined : err.detail,
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Invalid reference record.',
      details: process.env.NODE_ENV === 'production' ? undefined : err.detail,
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Invalid data for this operation.',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }

  console.error(err);
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error.' : err.message,
    details: process.env.NODE_ENV === 'production' ? undefined : err.details,
  });
}

module.exports = { notFound, errorHandler };
