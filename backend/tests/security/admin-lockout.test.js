// Kept in its own file, separate from rate-limit.test.js: Jest isolates the
// module registry per test file, so this gets a fresh app instance with an
// unexhausted IP rate limiter - sharing a file with tests that deliberately
// exhaust that limiter would make the per-account lockout asserted here
// indistinguishable from the IP limiter also tripping.

process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

describe('admin-login per-account lockout', () => {
  // The IP-based limiter (rate-limit.test.js) stops single-source brute
  // force but not credential stuffing against one specific account from
  // many IPs - this is the per-username backstop, and it trips well before
  // the IP limiter's own 10-request budget (5 failures here).
  test('locks out one specific username after repeated failures, without affecting another', async () => {
    db.execute.mockResolvedValue([[]]);

    // The lock activates after the 5th failure - it takes effect starting
    // with the NEXT attempt, so a 6th request is what actually observes it.
    let lastStatus;
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app)
        .post('/auth/admin-login')
        .send({ username: 'target-account', password: 'wrong' });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);

    const otherRes = await request(app)
      .post('/auth/admin-login')
      .send({ username: 'a-different-account', password: 'wrong' });

    expect(otherRes.status).toBe(401);
  }, 20000);
});
