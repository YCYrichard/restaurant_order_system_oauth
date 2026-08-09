// Confirms the cross-store IDOR fixes (resolveProductAccess,
// resolveCategoryAccess) actually hold: a user with no grant, or a grant
// for a *different* store, must be denied - only an admin or a user with
// owner_store_access for the product/category's own store may proceed.

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
const outsiderToken = tokenFor({ id: 2, role: 'customer' });

describe('products: cross-store authorization boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a user with no store access cannot update a product', async () => {
    db.execute
      .mockResolvedValueOnce([[{ store_id: 5 }]]) // product belongs to store 5
      .mockResolvedValueOnce([[]]); // no owner_store_access grant

    const res = await request(app)
      .put('/products/10')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Hacked Name', price: 1 });

    expect(res.status).toBe(403);
  });

  test("a user with access to a DIFFERENT store cannot deactivate this product", async () => {
    db.execute
      .mockResolvedValueOnce([[{ store_id: 5 }]]) // product belongs to store 5
      .mockResolvedValueOnce([[]]); // grant exists for some other store, not 5

    const res = await request(app)
      .patch('/products/10/status')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  test('an admin can update any product regardless of store', async () => {
    db.execute
      .mockResolvedValueOnce([[{ store_id: 5 }]]) // resolveProductAccess
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ id: 10, name: 'Updated' }]]); // SELECT after update

    const res = await request(app)
      .put('/products/10')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated', price: 9.99 });

    expect(res.status).toBe(200);
  });

  test('an owner with access to the correct store can update its product', async () => {
    db.execute
      .mockResolvedValueOnce([[{ store_id: 5 }]]) // product belongs to store 5
      .mockResolvedValueOnce([[{ id: 1 }]]) // grant found for store 5
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ id: 10, name: 'Updated' }]]); // SELECT after update

    const res = await request(app)
      .put('/products/10')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Updated', price: 9.99 });

    expect(res.status).toBe(200);
  });

  test('rejects unauthenticated requests outright', async () => {
    const res = await request(app)
      .put('/products/10')
      .send({ name: 'Updated', price: 9.99 });

    expect(res.status).toBe(401);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('categories: cross-store authorization boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a user with no store access cannot delete a category', async () => {
    db.execute
      .mockResolvedValueOnce([
        [{ id: 20, store_id: 5, name: 'Drinks', sort_order: 0 }],
      ]) // findCategoryById
      .mockResolvedValueOnce([[]]); // hasStoreAccess -> none

    const res = await request(app)
      .delete('/categories/20')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  test('a user with access to a different store cannot rename this category', async () => {
    db.execute
      .mockResolvedValueOnce([
        [{ id: 20, store_id: 5, name: 'Drinks', sort_order: 0 }],
      ])
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .put('/categories/20')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Renamed', sortOrder: 1 });

    expect(res.status).toBe(403);
  });

  test('an admin can delete any empty category regardless of store', async () => {
    db.execute
      .mockResolvedValueOnce([
        [{ id: 20, store_id: 5, name: 'Drinks', sort_order: 0 }],
      ]) // findCategoryById
      .mockResolvedValueOnce([[{ count: 0 }]]) // countProductsInCategory
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

    const res = await request(app)
      .delete('/categories/20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  test('rejects unauthenticated requests outright', async () => {
    const res = await request(app).delete('/categories/20');

    expect(res.status).toBe(401);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('orders: store-scoped listing authorization boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a user with no access to the store is denied by requireStoreAccess', async () => {
    db.execute.mockResolvedValueOnce([[]]); // requireStoreAccess: no grant

    const res = await request(app)
      .get('/orders/store/10')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  test('a user with access to the store can list its orders', async () => {
    db.execute
      .mockResolvedValueOnce([[{ id: 1 }]]) // requireStoreAccess: grant found
      .mockResolvedValueOnce([[{ id: 1 }]]) // service-level hasStoreAccess re-check
      .mockResolvedValueOnce([[]]); // findOrdersByStore

    const res = await request(app)
      .get('/orders/store/10')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
  });
});

describe('users resource: admin-only boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('a non-admin cannot list users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('a non-admin cannot grant store access to anyone, including themselves', async () => {
    const res = await request(app)
      .post('/api/v1/users/2/store-access')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ storeId: 1, accessRole: 'owner' });

    expect(res.status).toBe(403);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
