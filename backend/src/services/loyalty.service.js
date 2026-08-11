const loyaltyRepository = require('../repositories/loyalty.repository');

class LoyaltyValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'LOYALTY_VALIDATION_ERROR';
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/// Resolves how much of an order a customer's points can cover, entirely
/// server-side - the client sends only a boolean "apply my points", never a
/// point count or dollar amount (same trust model as a coupon code).
/// Cap-and-apply, not a client-chosen partial amount: neither Toast nor
/// Square let a customer pick an arbitrary redemption size - both auto-
/// apply up to the order balance and leave the rest banked. Returns
/// {pointsRedeemed: 0, discountAmount: 0} rather than throwing when there's
/// nothing to redeem (no balance, or the order is already fully covered by
/// a coupon) - "asked to redeem but had nothing to redeem" isn't an error.
async function resolveRedemption({ userId, storeId, store, remainingAfterCoupon }, connection) {
  const balance = await loyaltyRepository.findBalance(userId, storeId, connection);

  if (balance <= 0 || remainingAfterCoupon <= 0) {
    return { pointsRedeemed: 0, discountAmount: 0 };
  }

  const pointValue = Number(store.loyalty_point_value);
  const affordablePoints = Math.floor(remainingAfterCoupon / pointValue);
  const pointsRedeemed = Math.min(balance, affordablePoints);

  if (pointsRedeemed <= 0) {
    return { pointsRedeemed: 0, discountAmount: 0 };
  }

  return {
    pointsRedeemed,
    discountAmount: roundMoney(pointsRedeemed * pointValue),
  };
}

/// Debits the resolved point count, race-safe against a concurrent
/// checkout spending the same balance - the WHERE clause does the
/// checking, not the earlier resolveRedemption read. Throws if the race
/// was lost, which rolls back the whole order (same pattern as a coupon
/// hitting its cap between resolution and reservation).
async function reserveRedemption(userId, storeId, pointsRedeemed, connection) {
  const debited = await loyaltyRepository.debitBalanceIfSufficient(
    userId,
    storeId,
    pointsRedeemed,
    connection
  );

  if (!debited) {
    throw new LoyaltyValidationError(
      'Your points balance changed before this order could be placed'
    );
  }
}

/// Points earn on order status -> 'completed', not on payment_status -
/// cash/manual orders (the majority for this app's likely target
/// restaurants) never reach payment_status 'paid' at all, so gating on
/// that would silently break earning for most real orders. 'completed' is
/// a terminal status a cancelled order can never also reach, so
/// cancellation needs no special-casing here.
async function earnPointsForOrder(order, store, connection) {
  if (!order.user_id) {
    return 0;
  }

  const pointsPerDollar = Number(store.loyalty_points_per_dollar);
  const points = Math.floor(Number(order.subtotal) * pointsPerDollar);

  if (points <= 0) {
    return 0;
  }

  await loyaltyRepository.adjustBalance(order.user_id, order.store_id, points, connection);
  await loyaltyRepository.insertLedgerEntry(
    {
      userId: order.user_id,
      storeId: order.store_id,
      orderId: order.id,
      type: 'earn',
      pointsDelta: points,
      description: 'Order completed',
    },
    connection
  );

  return points;
}

/// Claws back earned points proportional to the refunded amount (Square's
/// model, not Toast's - Toast's own docs explicitly punt on partial
/// refunds and recommend a full refund + re-order instead, a worse
/// precedent to follow than solving the math). Redeemed points are never
/// restored on refund, deliberately mirroring the existing coupon-
/// redemption precedent (coupon_redemptions is never reversed either).
/// Allowed to push a balance negative - self-limiting, since the next
/// redemption attempt's WHERE balance >= ? guard blocks further spending
/// until it recovers, so no extra guard is needed here.
async function clawBackForRefund(order, refundAmount, connection) {
  const pointsEarned = Number(order.points_earned) || 0;

  if (!order.user_id || pointsEarned <= 0) {
    return 0;
  }

  const orderTotal = Number(order.total);
  if (!(orderTotal > 0)) {
    return 0;
  }

  const proportion = Math.min(1, refundAmount / orderTotal);
  const clawback = Math.round(pointsEarned * proportion);

  if (clawback <= 0) {
    return 0;
  }

  await loyaltyRepository.adjustBalance(order.user_id, order.store_id, -clawback, connection);
  await loyaltyRepository.insertLedgerEntry(
    {
      userId: order.user_id,
      storeId: order.store_id,
      orderId: order.id,
      type: 'earn_reversal',
      pointsDelta: -clawback,
      description: 'Refund clawback',
    },
    connection
  );

  return clawback;
}

async function getBalance(userId, storeId) {
  return loyaltyRepository.findBalance(userId, storeId);
}

async function listBalancesForUser(userId) {
  return loyaltyRepository.findAllBalancesForUser(userId);
}

async function listTopHolders(storeId, limit) {
  const parsedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  return loyaltyRepository.findTopHoldersForStore(storeId, parsedLimit);
}

module.exports = {
  LoyaltyValidationError,
  resolveRedemption,
  reserveRedemption,
  earnPointsForOrder,
  clawBackForRefund,
  getBalance,
  listBalancesForUser,
  listTopHolders,
};
