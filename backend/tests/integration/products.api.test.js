jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

describe('GET /products/store/:storeId/public', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns active products for the store', async () => {
    db.execute.mockResolvedValue([
      [
        {
          id: 1,
          store_id: 3,
          category_id: 1,
          name: 'Burger',
          description: 'Tasty',
          price: '9.99',
          category_name: 'Mains',
        },
      ],
    ]);

    const res = await request(app).get('/products/store/3/public');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].name).toBe('Burger');

    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toMatch(/is_active = TRUE/);
    expect(params).toEqual([3]);
  });

  test('returns an empty array for a store with no active products', async () => {
    db.execute.mockResolvedValue([[]]);

    const res = await request(app).get('/products/store/999/public');

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  test('does not require authentication', async () => {
    db.execute.mockResolvedValue([[]]);

    const res = await request(app).get('/products/store/3/public');

    expect(res.status).not.toBe(401);
  });
});
