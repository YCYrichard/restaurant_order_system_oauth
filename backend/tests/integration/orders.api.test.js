process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/services/orders.service', () => {
  const actual = jest.requireActual('../../src/services/orders.service');
  return {
    ...actual,
    createOrder: jest.fn(),
    getOrdersForUser: jest.fn(),
    getOrderById: jest.fn(),
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const ordersService = require('../../src/services/orders.service');

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const validOrderBody = {
  storeId: 1,
  items: [{ productId: 1, quantity: 1, price: 10 }],
  total: 10,
  customerName: 'Jane Doe',
  customerPhone: '0912345678',
};

describe('POST /orders', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates an order without requiring auth (guest checkout)', async () => {
    ordersService.createOrder.mockResolvedValue({ id: 1, items: [] });

    const res = await request(app).post('/orders').send(validOrderBody);

    expect(res.status).toBe(201);
    expect(res.body.order).toEqual({ id: 1, items: [] });
  });

  test('returns 400 with the stable error shape on validation failure', async () => {
    ordersService.createOrder.mockRejectedValue(
      new ordersService.OrderValidationError('Missing required fields')
    );

    const res = await request(app).post('/orders').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'ORDER_VALIDATION_ERROR',
      message: 'Missing required fields',
    });
    expect(res.body.requestId).toBeTruthy();
  });

  test('returns a generic 500 without leaking internals on unexpected errors', async () => {
    ordersService.createOrder.mockRejectedValue(
      new Error('ECONNREFUSED 127.0.0.1:3306')
    );

    const res = await request(app).post('/orders').send(validOrderBody);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});

describe('GET /orders/user/:userId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/orders/user/1');
    expect(res.status).toBe(401);
  });

  test("rejects a user requesting someone else's orders", async () => {
    const token = tokenFor({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/orders/user/2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(ordersService.getOrdersForUser).not.toHaveBeenCalled();
  });

  test('allows a user to fetch their own orders', async () => {
    ordersService.getOrdersForUser.mockResolvedValue([{ id: 1 }]);
    const token = tokenFor({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/orders/user/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([{ id: 1 }]);
  });

  test('allows an admin to fetch any user\'s orders', async () => {
    ordersService.getOrdersForUser.mockResolvedValue([]);
    const token = tokenFor({ id: 999, role: 'admin' });

    const res = await request(app)
      .get('/orders/user/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(ordersService.getOrdersForUser).toHaveBeenCalledWith(1);
  });
});

describe('GET /orders/:orderId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/orders/5');
    expect(res.status).toBe(401);
  });

  test('returns 404 when the order does not exist', async () => {
    ordersService.getOrderById.mockResolvedValue(null);
    const token = tokenFor({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/orders/5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test("rejects a user requesting someone else's order", async () => {
    ordersService.getOrderById.mockResolvedValue({ id: 5, user_id: 2 });
    const token = tokenFor({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/orders/5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('allows the owning user to fetch their order', async () => {
    ordersService.getOrderById.mockResolvedValue({ id: 5, user_id: 1 });
    const token = tokenFor({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/orders/5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.order).toEqual({ id: 5, user_id: 1 });
  });
});
