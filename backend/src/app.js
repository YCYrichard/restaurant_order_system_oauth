const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

require('dotenv').config();
require('./config/env'); // fail fast if required env vars are missing

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/orders.routes');
const storesRoutes = require('./routes/stores.routes');
const productsRoutes = require('./routes/products.routes');
const categoriesRoutes = require('./routes/categories.routes');
const usersRoutes = require('./routes/users.routes');
const couponsRoutes = require('./routes/coupons.routes');
const eventsRoutes = require('./routes/events.routes');
const modifiersRoutes = require('./routes/modifiers.routes');
const paymentsRoutes = require('./routes/payments.routes');
const reportsRoutes = require('./routes/reports.routes');
const requestId = require('./middleware/requestId.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(requestId);

// helmet's default CSP is script-src 'self', which blocks the TapPay Web SDK
// outright - the browser would refuse to load it and card payment would fail
// with nothing in the API logs to explain why. The allowance is narrowed to
// TapPay's own origins rather than opened up wholesale.
//
// This CSP governs API responses. The Flutter app is served separately, so
// its own host needs the same allowance for the SDK to load there.
const TAPPAY_ORIGINS = [
  'https://js.tappaysdk.com',
  'https://sandbox.tappaysdk.com',
  'https://prod.tappaysdk.com',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", ...TAPPAY_ORIGINS],
        'frame-src': ["'self'", ...TAPPAY_ORIGINS],
        'connect-src': ["'self'", ...TAPPAY_ORIGINS],
      },
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no Origin header (health checks, curl, etc).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error('Not allowed by CORS');
      error.status = 403;
      error.code = 'CORS_NOT_ALLOWED';
      return callback(error);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    service: 'restaurant-order-system-api',
  });
});

app.use('/auth', authRoutes);
app.use('/orders', orderRoutes);
app.use('/stores', storesRoutes);
app.use('/products', productsRoutes);
app.use('/categories', categoriesRoutes);

// New resources are mounted under /api/v1 per the skill's versioned-
// resource convention. The existing resources above predate that
// convention and stay unversioned for now - retrofitting them means
// updating every existing frontend call site, which is a separate,
// deliberately deferred migration rather than something to fold in here.
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/coupons', couponsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/events', eventsRoutes);
app.use('/modifiers', modifiersRoutes);
app.use('/payments', paymentsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
