// Per-username failed-attempt tracking for local (admin/owner/staff) login.
// The existing express-rate-limit on /auth/admin-login is per-IP only, which
// stops single-source brute force but not distributed credential stuffing -
// the same shape of attack that hit Chick-fil-A in 2022/2023 (leaked
// credentials tried at scale from many IPs). This closes that gap for the
// specific-account case without needing a shared store: in-process, single-
// instance, same accepted tradeoff already documented on events.service.js's
// EventEmitter (a Redis-backed store is the multi-instance upgrade path,
// not needed at this scale).

const FAILED_ATTEMPT_LIMIT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const attemptsByUsername = new Map();

function isLocked(username) {
  const entry = attemptsByUsername.get(username);

  if (!entry || !entry.lockedUntil) {
    return false;
  }

  if (entry.lockedUntil <= Date.now()) {
    attemptsByUsername.delete(username);
    return false;
  }

  return true;
}

function recordFailure(username) {
  const entry = attemptsByUsername.get(username) || { count: 0, lockedUntil: null };

  entry.count += 1;

  if (entry.count >= FAILED_ATTEMPT_LIMIT) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }

  attemptsByUsername.set(username, entry);
}

function recordSuccess(username) {
  attemptsByUsername.delete(username);
}

module.exports = {
  isLocked,
  recordFailure,
  recordSuccess,
};
