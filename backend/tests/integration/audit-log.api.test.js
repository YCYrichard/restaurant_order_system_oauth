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

const adminToken = tokenFor({ id: 1, role: 'admin' });
const ownerToken = tokenFor({ id: 2, role: 'owner' });

describe('GET /api/v1/audit-log', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/audit-log');

    expect(res.status).toBe(401);
    expect(db.execute).not.toHaveBeenCalled();
  });

  // Platform-wide visibility only, not scoped to owners - same reasoning
  // as UsersPanel being admin-only: an owner reaching this would only see
  // other stores' actions they have no business viewing.
  test('rejects an owner - this is platform-wide, not scoped to their store', async () => {
    const res = await request(app)
      .get('/api/v1/audit-log')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('returns a paginated list for an admin', async () => {
    db.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            actor_user_id: 4,
            actor_name: 'supermao',
            actor_role: 'admin',
            action: 'order.refunded',
            resource_type: 'order',
            resource_id: 27,
            store_id: 1,
            store_name: 'Demo Store',
            details: '{"amount":5}',
            ip_address: '127.0.0.1',
            created_at: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([[{ count: 1 }]]);

    const res = await request(app)
      .get('/api/v1/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
  });

  test('passes query filters through to the repository layer', async () => {
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ count: 0 }]]);

    const res = await request(app)
      .get('/api/v1/audit-log?storeId=1&action=order.refunded')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(db.execute.mock.calls[0][1]).toEqual([1, 'order.refunded']);
  });
});
