const rateLimit = require('express-rate-limit');

// Shared with auth.routes.js's own limiters, which predate this file.
const RATE_LIMIT_MESSAGE = {
  code: 'RATE_LIMITED',
  message: 'Too many requests, please try again later.',
  details: null,
};

// Applied globally in app.js. Generous enough not to bother normal usage -
// this exists so no route is ever completely unbounded, not to be the
// binding constraint anywhere a tighter, route-specific limiter applies.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// Card-charge attempts had zero rate limiting before this - a card-testing/
// fraud vector against the payment gateway, not just a resource-exhaustion
// concern. Tight enough to blunt scripted attempts, loose enough to survive
// a few legitimate retries after a declined card or a slow SDK response.
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

module.exports = { RATE_LIMIT_MESSAGE, globalLimiter, paymentLimiter };
