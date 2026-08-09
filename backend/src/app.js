const express = require('express');
const cors = require('cors');

require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/orders.routes');
const storesRoutes = require('./routes/stores.routes');
const productsRoutes = require('./routes/products.routes');
const categoriesRoutes = require('./routes/categories.routes');

const app = express();

app.use(
  cors({
    origin: true,
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
