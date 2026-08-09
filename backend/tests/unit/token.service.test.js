jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const db = require('../../src/config/db');
const tokenService = require('../../src/services/token.service');

describe('token.service.issueAccessToken', () => {
  test('signs a short-lived JWT with the expected claims', () => {
    const token = tokenService.issueAccessToken({
      id: 1,
      name: 'Jane',
      email: 'jane@example.com',
      provider: 'google',
      role: 'customer',
    });

    const decoded = jwt.decode(token);

    expect(decoded).toMatchObject({
      id: 1,
      name: 'Jane',
      email: 'jane@example.com',
      provider: 'google',
      role: 'customer',
    });
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});

describe('token.service.issueRefreshToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores a hash of the token, not the raw token', async () => {
    db.execute.mockResolvedValue([{ insertId: 1 }]);

    const token = await tokenService.issueRefreshToken(7, {
      userAgent: 'jest',
      ip: '127.0.0.1',
    });

    expect(token).toEqual(expect.any(String));

    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO refresh_tokens/);
    expect(params[0]).toBe(7);
    expect(params[1]).not.toBe(token);
    expect(params[1]).toHaveLength(64); // sha256 hex digest
  });
});

describe('token.service.rotateRefreshToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns invalid when the token is not found', async () => {
    db.execute.mockResolvedValueOnce([[]]);

    const result = await tokenService.rotateRefreshToken('unknown-token');

    expect(result).toEqual({ error: 'invalid' });
  });

  test('returns expired when the stored token is past its expiry', async () => {
    db.execute.mockResolvedValueOnce([
      [
        {
          id: 1,
          user_id: 5,
          revoked_at: null,
          expires_at: new Date(Date.now() - 1000),
        },
      ],
    ]);

    const result = await tokenService.rotateRefreshToken('expired-token');

    expect(result).toEqual({ error: 'expired' });
  });

  test('revokes the whole chain and reports reuse when a revoked token is presented again', async () => {
    db.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            user_id: 5,
            revoked_at: new Date(),
            expires_at: new Date(Date.now() + 100000),
          },
        ],
      ])
      .mockResolvedValueOnce([{}]);

    const result = await tokenService.rotateRefreshToken('stolen-token');

    expect(result).toEqual({ error: 'reused' });
    expect(db.execute).toHaveBeenLastCalledWith(
      expect.stringMatching(/UPDATE refresh_tokens/),
      [5]
    );
  });

  test('rotates a valid token: inserts a new one and revokes the old one', async () => {
    db.execute
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            user_id: 5,
            revoked_at: null,
            expires_at: new Date(Date.now() + 100000),
          },
        ],
      ])
      .mockResolvedValueOnce([{ insertId: 2 }])
      .mockResolvedValueOnce([{}]);

    const result = await tokenService.rotateRefreshToken('valid-token');

    expect(result.userId).toBe(5);
    expect(result.token).toEqual(expect.any(String));
    expect(result.token).not.toBe('valid-token');

    const revokeCall = db.execute.mock.calls[2];
    expect(revokeCall[0]).toMatch(/SET revoked_at = NOW\(\), replaced_by_id = \?/);
    expect(revokeCall[1]).toEqual([2, 1]);
  });
});

describe('token.service.revokeRefreshToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates the row matching the token hash', async () => {
    db.execute.mockResolvedValue([{}]);

    await tokenService.revokeRefreshToken('some-token');

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE refresh_tokens/),
      [expect.any(String)]
    );
  });
});
