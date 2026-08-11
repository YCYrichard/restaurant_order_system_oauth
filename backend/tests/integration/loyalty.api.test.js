process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/config/db');

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const customerToken = tokenFor({ id: 3, role: 'customer' });
const staffToken = tokenFor({ id: 2, role: 'staff' });
const ownerToken = tokenFor({ id: 1, role: 'owner' });

describe('GET /api/v1/loyalty/balance/:storeId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/loyalty/balance/1');

    expect(res.status).toBe(401);
  });

  test("returns the caller's own balance", async () => {
    db.execute.mockResolvedValueOnce([[{ balance: 250 }]]);

    const res = await request(app)
      .get('/api/v1/loyalty/balance/1')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ storeId: 1, balance: 250 });
    expect(db.execute.mock.calls[0][1]).toEqual([3, 1]);
  });

  test('returns zero for an account with no activity at this store', async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/v1/loyalty/balance/1')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
  });
});

describe('GET /api/v1/loyalty/store/:storeId/top-holders', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a staff-tier grant - this is owner-tier business intelligence', async () => {
    db.execute.mockResolvedValueOnce([[{ access_role: 'staff' }]]); // requireStoreAccess

    const res = await request(app)
      .get('/api/v1/loyalty/store/1/top-holders')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  test('allows an owner-tier grant', async () => {
    db.execute
      .mockResolvedValueOnce([[{ access_role: 'owner' }]]) // requireStoreAccess
      .mockResolvedValueOnce([
        [{ user_id: 3, name: 'Ada', email: 'ada@example.com', balance: 500 }],
      ]);

    const res = await request(app)
      .get('/api/v1/loyalty/store/1/top-holders')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.holders).toHaveLength(1);
  });
});
