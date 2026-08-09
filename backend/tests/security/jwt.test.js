process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const db = require('../../src/config/db');

describe('JWT security', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a token signed with the wrong secret', async () => {
    const forgedToken = jwt.sign({ id: 1, role: 'admin' }, 'wrong-secret', {
      expiresIn: '1h',
    });

    const res = await request(app)
      .get('/stores')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(db.execute).not.toHaveBeenCalled();
  });

  test('rejects an expired token', async () => {
    const expiredToken = jwt.sign(
      { id: 1, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/stores')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  test('rejects a token with a tampered payload (signature no longer matches)', async () => {
    const validToken = jwt.sign(
      { id: 1, role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const [header, payload, signature] = validToken.split('.');

    // Escalate role to admin in the payload without re-signing.
    const decodedPayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );
    decodedPayload.role = 'admin';
    const forgedPayload = Buffer.from(
      JSON.stringify(decodedPayload)
    ).toString('base64url');
    const tamperedToken = `${header}.${forgedPayload}.${signature}`;

    const res = await request(app)
      .get('/stores')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
  });

  test('rejects a malformed Authorization header', async () => {
    const res = await request(app)
      .get('/stores')
      .set('Authorization', 'NotBearer sometoken');

    expect(res.status).toBe(401);
  });

  test('rejects requests with no Authorization header at all', async () => {
    const res = await request(app).get('/stores');
    expect(res.status).toBe(401);
  });
});
