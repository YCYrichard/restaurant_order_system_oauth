// Stable error shape { code, message, details, requestId } per the
// full-stack-web-development skill. Existing controllers still catch and
// respond to their own errors inline; this is the safety net for anything
// that reaches here (unmatched routes, malformed request bodies, and
// controllers migrated to next(err) going forward).

function notFoundHandler(req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Resource not found',
    details: null,
    requestId: req.requestId || null,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  const status = Number.isInteger(err.status) ? err.status : 500;
  const isServerError = status >= 500;

  res.status(status).json({
    code: err.code || (isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: isServerError ? 'Internal server error' : err.message || 'Request failed',
    details: isServerError ? null : err.details || null,
    requestId: req.requestId || null,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
