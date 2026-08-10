process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/services/orders.service', () => {
  const actual = jest.requireActual('../../src/services/orders.service');
  return {
    ...actual,
    createOrder: jest.fn(),
    getOrdersForUser: jest.fn(),
    getOrderById: jest.fn(),
    updateOrderStatus: jest.fn(),
    listOrdersForStore: jest.fn(),
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

  test('rejects unauthenticated requests - an account is required to order', async () => {
    const res = await request(app).post('/orders').send(validOrderBody);

    expect(res.status).toBe(401);
    expect(ordersService.createOrder).not.toHaveBeenCalled();
  });

  test('creates an order for the authenticated caller', async () => {
    ordersService.createOrder.mockResolvedValue({ id: 1, items: [] });
    const token = tokenFor({ id: 7, role: 'customer' });

    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(validOrderBody);

    expect(res.status).toBe(201);
    expect(res.body.order).toEqual({ id: 1, items: [] });
    expect(ordersService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ ...validOrderBody, userId: 7 })
    );
  });

  test('ignores a client-supplied userId and uses the token instead', async () => {
    ordersService.createOrder.mockResolvedValue({ id: 1, items: [] });
    const token = tokenFor({ id: 7, role: 'customer' });

    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validOrderBody, userId: 999 });

    expect(ordersService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 })
    );
  });

  test('returns 400 with the stable error shape on validation failure', async () => {
    ordersService.createOrder.mockRejectedValue(
      new ordersService.OrderValidationError('Missing required fields')
    );
    const token = tokenFor({ id: 7, role: 'customer' });

    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({});

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
    const token = tokenFor({ id: 7, role: 'customer' });

    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(validOrderBody);

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

describe('PATCH /orders/:orderId/status', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .patch('/orders/5/status')
      .send({ status: 'confirmed' });

    expect(res.status).toBe(401);
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('returns the stable error shape when the service rejects the transition', async () => {
    ordersService.updateOrderStatus.mockRejectedValue(
      new ordersService.OrderValidationError(
        "Cannot transition order from 'completed' to 'cancelled'"
      )
    );
    const token = tokenFor({ id: 1, role: 'admin' });

    const res = await request(app)
      .patch('/orders/5/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ORDER_VALIDATION_ERROR');
  });

  test('returns the updated order on success', async () => {
    ordersService.updateOrderStatus.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });
    const token = tokenFor({ id: 1, role: 'admin' });

    const res = await request(app)
      .patch('/orders/5/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.order).toEqual({ id: 5, status: 'confirmed' });
    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ id: 1, role: 'admin' }),
      'confirmed'
    );
  });
});

describe('GET /orders/store/:storeId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/orders/store/10');
    expect(res.status).toBe(401);
    expect(ordersService.listOrdersForStore).not.toHaveBeenCalled();
  });

  test('returns orders for an admin (bypasses the store-access DB check)', async () => {
    ordersService.listOrdersForStore.mockResolvedValue([{ id: 1 }]);
    const token = tokenFor({ id: 1, role: 'admin' });

    const res = await request(app)
      .get('/orders/store/10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([{ id: 1 }]);
  });
});
