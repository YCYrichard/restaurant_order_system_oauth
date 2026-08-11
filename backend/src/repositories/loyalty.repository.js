const db = require('../config/db');

async function findBalance(userId, storeId, connection = db) {
  const [rows] = await connection.execute(
    `
      SELECT balance
      FROM loyalty_accounts
      WHERE user_id = ?
        AND store_id = ?
      LIMIT 1
    `,
    [userId, storeId]
  );

  return rows[0]?.balance ?? 0;
}

async function findAllBalancesForUser(userId) {
  const [rows] = await db.execute(
    `
      SELECT la.store_id, la.balance, s.name AS store_name
      FROM loyalty_accounts la
      JOIN stores s ON s.id = la.store_id
      WHERE la.user_id = ?
        AND la.balance != 0
      ORDER BY s.name ASC
    `,
    [userId]
  );

  return rows;
}

// Credits or debits a balance unconditionally, upserting the account into
// existence at 0 first if this is the customer's first activity at this
// store. Used for earning points and for refund clawback (a negative
// delta) - neither needs the race-safe conditional guard redemption does,
// since crediting can't overdraw anything and a clawback is allowed to
// push a balance negative (see loyalty.service.js).
async function adjustBalance(userId, storeId, pointsDelta, connection = db) {
  await connection.execute(
    `
      INSERT INTO loyalty_accounts (user_id, store_id, balance)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
    `,
    [userId, storeId, pointsDelta]
  );
}

// Race-safe redemption debit - the WHERE clause does the checking, not a
// prior read, mirroring coupons.repository.js:incrementRedemptionCount.
// Returns false if the balance is insufficient, including when the
// account doesn't exist yet (nothing to redeem against).
async function debitBalanceIfSufficient(userId, storeId, points, connection = db) {
  const [result] = await connection.execute(
    `
      UPDATE loyalty_accounts
      SET balance = balance - ?
      WHERE user_id = ?
        AND store_id = ?
        AND balance >= ?
    `,
    [points, userId, storeId, points]
  );

  return result.affectedRows > 0;
}

async function insertLedgerEntry(
  { userId, storeId, orderId, type, pointsDelta, description },
  connection = db
) {
  await connection.execute(
    `
      INSERT INTO loyalty_ledger (
        user_id, store_id, order_id, type, points_delta, description
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [userId, storeId, orderId ?? null, type, pointsDelta, description ?? null]
  );
}

async function findTopHoldersForStore(storeId, limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;

  // mysql2 doesn't reliably accept LIMIT as a bound `?` placeholder - safe
  // to inline here since the sole caller (loyalty.service.listTopHolders)
  // already clamps it to a validated integer.
  const [rows] = await db.execute(
    `
      SELECT la.user_id, u.name, u.email, la.balance
      FROM loyalty_accounts la
      JOIN users u ON u.id = la.user_id
      WHERE la.store_id = ?
        AND la.balance > 0
      ORDER BY la.balance DESC
      LIMIT ${safeLimit}
    `,
    [storeId]
  );

  return rows;
}

module.exports = {
  findBalance,
  findAllBalancesForUser,
  adjustBalance,
  debitBalanceIfSufficient,
  insertLedgerEntry,
  findTopHoldersForStore,
};
