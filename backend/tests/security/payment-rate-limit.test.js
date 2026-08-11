// Own file for the same reason as admin-lockout.test.js - a fresh app
// instance means the payment limiter's budget hasn't been touched by any
// other test file.

process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/config/db');

const customerToken = jwt.sign(
  { id: 1, role: 'customer' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('payment endpoint rate limiting', () => {
  // POST /orders/:orderId/payments previously had zero rate limiting - a
  // card-testing/fraud vector against the payment gateway, not just a
  // resource-exhaustion concern. No matching order, so every attempt
  // short-circuits to 400 before ever reaching a provider - only the
  // limiter's own counting is under test.
  test('trips the limiter after repeated attempts from the same client', async () => {
    db.execute.mockResolvedValue([[]]); // findOrderById -> not found

    let lastStatus;

    for (let i = 0; i < 21; i += 1) {
      const res = await request(app)
        .post('/orders/999/payments')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ provider: 'manual' });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  }, 20000);
});
