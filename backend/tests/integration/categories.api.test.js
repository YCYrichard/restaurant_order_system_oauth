jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

describe('GET /categories/store/:storeId/public', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns categories for the store', async () => {
    db.execute.mockResolvedValue([
      [
        { id: 1, store_id: 3, name: 'Mains', sort_order: 0 },
        { id: 2, store_id: 3, name: 'Drinks', sort_order: 1 },
      ],
    ]);

    const res = await request(app).get('/categories/store/3/public');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(2);

    const [, params] = db.execute.mock.calls[0];
    expect(params).toEqual([3]);
  });

  test('returns an empty array for a store with no categories', async () => {
    db.execute.mockResolvedValue([[]]);

    const res = await request(app).get('/categories/store/999/public');

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
  });

  test('does not require authentication', async () => {
    db.execute.mockResolvedValue([[]]);

    const res = await request(app).get('/categories/store/3/public');

    expect(res.status).not.toBe(401);
  });
});
