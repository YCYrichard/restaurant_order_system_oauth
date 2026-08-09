process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

describe('rate limiting', () => {
  test('admin-login trips the limiter after repeated attempts from the same client', async () => {
    // No matching admin user, so every attempt short-circuits to 401
    // before ever reaching bcrypt - only the rate limiter's own counting
    // is under test here.
    db.execute.mockResolvedValue([[]]);

    let lastStatus;

    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post('/auth/admin-login')
        .send({ username: 'nope', password: 'nope' });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  }, 20000);
});
