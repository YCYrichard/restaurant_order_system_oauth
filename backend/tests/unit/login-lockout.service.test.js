const loginLockoutService = require('../../src/services/login-lockout.service');

// State is in-process module-level (documented tradeoff, same as
// events.service.js's EventEmitter) - each test uses its own username so
// tests can't pollute each other via shared state.

describe('login-lockout.service', () => {
  test('is not locked before any failures', () => {
    expect(loginLockoutService.isLocked('fresh-user')).toBe(false);
  });

  test('does not lock out before the failure limit is reached', () => {
    const username = 'under-limit-user';

    for (let i = 0; i < 4; i += 1) {
      loginLockoutService.recordFailure(username);
    }

    expect(loginLockoutService.isLocked(username)).toBe(false);
  });

  test('locks out once the failure limit is reached', () => {
    const username = 'at-limit-user';

    for (let i = 0; i < 5; i += 1) {
      loginLockoutService.recordFailure(username);
    }

    expect(loginLockoutService.isLocked(username)).toBe(true);
  });

  test('a success clears prior failures', () => {
    const username = 'recovers-user';

    for (let i = 0; i < 4; i += 1) {
      loginLockoutService.recordFailure(username);
    }
    loginLockoutService.recordSuccess(username);
    loginLockoutService.recordFailure(username);

    // Only 1 failure since the reset - nowhere near the limit.
    expect(loginLockoutService.isLocked(username)).toBe(false);
  });

  test('tracks each username independently', () => {
    for (let i = 0; i < 5; i += 1) {
      loginLockoutService.recordFailure('locked-user');
    }

    expect(loginLockoutService.isLocked('locked-user')).toBe(true);
    expect(loginLockoutService.isLocked('untouched-user')).toBe(false);
  });
});
