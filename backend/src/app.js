const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/orders.routes');
const storesRoutes = require('./routes/stores.routes');
const productsRoutes = require('./routes/products.routes');
const categoriesRoutes = require('./routes/categories.routes');
const requestId = require('./middleware/requestId.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(requestId);
app.use(helmet());

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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
