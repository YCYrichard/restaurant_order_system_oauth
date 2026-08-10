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
const customerToken = tokenFor({ id: 2, role: 'customer' });

describe('GET /api/v1/users', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  test('rejects non-admin users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  test('returns a paginated list for admins', async () => {
    db.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            name: 'Jane',
            email: 'jane@example.com',
            provider: 'google',
            role: 'customer',
            created_at: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([[{ count: 1 }]]);

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  test('caps pageSize at 100', async () => {
    db.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ count: 0 }]]);

    const res = await request(app)
      .get('/api/v1/users?pageSize=500')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });
});

describe('POST /api/v1/users', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects non-admin users', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Kitchen',
        username: 'kitchen1',
        password: 'longenough1',
        role: 'staff',
      });

    expect(res.status).toBe(403);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('refuses to create an admin through this endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sneaky',
        username: 'sneaky',
        password: 'longenough1',
        role: 'admin',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_VALIDATION_ERROR');
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('rejects a short password before hashing anything', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kitchen',
        username: 'kitchen1',
        password: 'short',
        role: 'staff',
      });

    expect(res.status).toBe(400);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('rejects a duplicate username', async () => {
    db.execute.mockResolvedValueOnce([[{ id: 9 }]]); // findLocalUserByUsername

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kitchen',
        username: 'kitchen1',
        password: 'longenough1',
        role: 'staff',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already taken/);
  });

  test('creates a staff account and never returns the password hash', async () => {
    db.execute
      .mockResolvedValueOnce([[]]) // findLocalUserByUsername -> free
      .mockResolvedValueOnce([{ insertId: 12 }]) // insertLocalUser
      .mockResolvedValueOnce([
        [
          {
            id: 12,
            name: 'Kitchen',
            email: null,
            provider: 'local',
            role: 'staff',
          },
        ],
      ]);

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Kitchen',
        username: 'kitchen1',
        password: 'longenough1',
        role: 'staff',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: 12, role: 'staff' });
    expect(JSON.stringify(res.body)).not.toContain('password');

    // The stored value must be a bcrypt hash, never the plaintext.
    const insertParams = db.execute.mock.calls[1][1];
    expect(insertParams).not.toContain('longenough1');
    expect(insertParams[3]).toMatch(/^\$2[aby]\$/);
  });
});

describe('GET /api/v1/users/:userId/store-access', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when the user does not exist', async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/v1/users/999/store-access')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('returns the store-access grants for an existing user', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2 }]])
      .mockResolvedValueOnce([
        [{ id: 1, store_id: 1, access_role: 'owner', store_name: 'Demo Store' }],
      ]);

    const res = await request(app)
      .get('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.storeAccess).toHaveLength(1);
  });
});

describe('POST /api/v1/users/:userId/store-access', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects non-admin users', async () => {
    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ storeId: 1, accessRole: 'owner' });

    expect(res.status).toBe(403);
  });

  test('rejects an invalid accessRole before touching the database', async () => {
    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_VALIDATION_ERROR');
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('returns 400 when the store does not exist', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2 }]]) // requireUser
      .mockResolvedValueOnce([[]]); // findStoreById -> not found

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 999, accessRole: 'owner' });

    expect(res.status).toBe(400);
  });

  test('grants access and returns the updated grant list', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2 }]]) // requireUser
      .mockResolvedValueOnce([[{ id: 1 }]]) // findStoreById
      .mockResolvedValueOnce([{}]) // INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce([
        [{ id: 5, store_id: 1, access_role: 'owner', store_name: 'Demo Store' }],
      ]);

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'owner' });

    expect(res.status).toBe(201);
    expect(res.body.storeAccess).toHaveLength(1);
  });

  test('promotes a customer to owner when granted owner access', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2, role: 'customer' }]]) // requireUser
      .mockResolvedValueOnce([[{ id: 1 }]]) // findStoreById
      .mockResolvedValueOnce([{}]) // INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce([{}]) // UPDATE users SET role
      .mockResolvedValueOnce([
        [{ id: 5, store_id: 1, access_role: 'owner', store_name: 'Demo Store' }],
      ]);

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'owner' });

    expect(res.status).toBe(201);
    expect(db.execute).toHaveBeenCalledTimes(5);
    expect(db.execute.mock.calls[3][0]).toMatch(/UPDATE users/);
    expect(db.execute.mock.calls[3][1]).toEqual(['owner', 2]);
  });

  test('promotes a customer to owner when granted manager access', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2, role: 'customer' }]]) // requireUser
      .mockResolvedValueOnce([[{ id: 1 }]]) // findStoreById
      .mockResolvedValueOnce([{}]) // INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce([{}]) // UPDATE users SET role
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'manager' });

    expect(res.status).toBe(201);
    expect(db.execute.mock.calls[3][1]).toEqual(['owner', 2]);
  });

  test('promotes a customer to staff when granted staff access', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2, role: 'customer' }]]) // requireUser
      .mockResolvedValueOnce([[{ id: 1 }]]) // findStoreById
      .mockResolvedValueOnce([{}]) // INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce([{}]) // UPDATE users SET role
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'staff' });

    expect(res.status).toBe(201);
    expect(db.execute.mock.calls[3][1]).toEqual(['staff', 2]);
  });

  test('does not touch role for a user who is already staff-tier', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 2, role: 'owner' }]]) // requireUser
      .mockResolvedValueOnce([[{ id: 1 }]]) // findStoreById
      .mockResolvedValueOnce([{}]) // INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ storeId: 1, accessRole: 'staff' });

    expect(res.status).toBe(201);
    expect(db.execute).toHaveBeenCalledTimes(4);
  });
});

describe('DELETE /api/v1/users/:userId/store-access/:storeId', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when the grant does not exist', async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .delete('/api/v1/users/2/store-access/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('revokes an existing grant', async () => {
    db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .delete('/api/v1/users/2/store-access/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});
