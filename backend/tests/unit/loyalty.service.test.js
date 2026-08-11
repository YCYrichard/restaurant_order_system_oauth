jest.mock('../../src/repositories/loyalty.repository');

const loyaltyRepository = require('../../src/repositories/loyalty.repository');
const loyaltyService = require('../../src/services/loyalty.service');

const store = {
  id: 1,
  loyalty_enabled: true,
  loyalty_points_per_dollar: '1.00',
  loyalty_point_value: '0.01',
};

describe('loyalty.service.resolveRedemption', () => {
  beforeEach(() => jest.clearAllMocks());

  test('redeems nothing when the balance is zero', async () => {
    loyaltyRepository.findBalance.mockResolvedValue(0);

    const result = await loyaltyService.resolveRedemption({
      userId: 1,
      storeId: 1,
      store,
      remainingAfterCoupon: 20,
    });

    expect(result).toEqual({ pointsRedeemed: 0, discountAmount: 0 });
  });

  test('redeems nothing when the order is already fully covered', async () => {
    loyaltyRepository.findBalance.mockResolvedValue(500);

    const result = await loyaltyService.resolveRedemption({
      userId: 1,
      storeId: 1,
      store,
      remainingAfterCoupon: 0,
    });

    expect(result).toEqual({ pointsRedeemed: 0, discountAmount: 0 });
  });

  // Cap-and-apply, not a customer-chosen amount: applies the smaller of
  // the balance or what the order can absorb, never more than either.
  test('caps redemption at the order balance when points exceed it', async () => {
    loyaltyRepository.findBalance.mockResolvedValue(10000);

    const result = await loyaltyService.resolveRedemption({
      userId: 1,
      storeId: 1,
      store,
      remainingAfterCoupon: 5, // at $0.01/point, at most 500 points fit
    });

    expect(result).toEqual({ pointsRedeemed: 500, discountAmount: 5 });
  });

  test('caps redemption at the balance when the order could absorb more', async () => {
    loyaltyRepository.findBalance.mockResolvedValue(120);

    const result = await loyaltyService.resolveRedemption({
      userId: 1,
      storeId: 1,
      store,
      remainingAfterCoupon: 50,
    });

    expect(result).toEqual({ pointsRedeemed: 120, discountAmount: 1.2 });
  });
});

describe('loyalty.service.reserveRedemption', () => {
  beforeEach(() => jest.clearAllMocks());

  test('debits the balance when sufficient', async () => {
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(true);

    await expect(
      loyaltyService.reserveRedemption(1, 1, 100, {})
    ).resolves.toBeUndefined();
  });

  // The race this closes: two concurrent checkouts both resolving against
  // the same stale balance before either commits.
  test('throws when the balance changed before the debit landed', async () => {
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(false);

    await expect(
      loyaltyService.reserveRedemption(1, 1, 100, {})
    ).rejects.toThrow(loyaltyService.LoyaltyValidationError);
  });
});

describe('loyalty.service.earnPointsForOrder', () => {
  beforeEach(() => jest.clearAllMocks());

  test('earns floor(subtotal * pointsPerDollar) for a signed-in customer', async () => {
    const order = { id: 5, user_id: 3, store_id: 1, subtotal: '12.99' };

    const points = await loyaltyService.earnPointsForOrder(order, store);

    expect(points).toBe(12);
    expect(loyaltyRepository.adjustBalance).toHaveBeenCalledWith(3, 1, 12, undefined);
    expect(loyaltyRepository.insertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'earn', pointsDelta: 12, orderId: 5 }),
      undefined
    );
  });

  test('earns nothing for a guest order with no user_id', async () => {
    const order = { id: 5, user_id: null, store_id: 1, subtotal: '12.99' };

    const points = await loyaltyService.earnPointsForOrder(order, store);

    expect(points).toBe(0);
    expect(loyaltyRepository.adjustBalance).not.toHaveBeenCalled();
  });

  test('earns nothing when the subtotal rounds down to less than one point', async () => {
    const order = { id: 5, user_id: 3, store_id: 1, subtotal: '0.50' };

    const points = await loyaltyService.earnPointsForOrder(order, {
      ...store,
      loyalty_points_per_dollar: '1.00',
    });

    expect(points).toBe(0);
    expect(loyaltyRepository.adjustBalance).not.toHaveBeenCalled();
  });
});

describe('loyalty.service.clawBackForRefund', () => {
  beforeEach(() => jest.clearAllMocks());

  test('claws back points proportional to the refunded amount', async () => {
    const order = {
      id: 5,
      user_id: 3,
      store_id: 1,
      total: '20.00',
      points_earned: 100,
    };

    // 5 of 20 refunded (25%) -> 25 points back.
    const clawback = await loyaltyService.clawBackForRefund(order, 5, {});

    expect(clawback).toBe(25);
    expect(loyaltyRepository.adjustBalance).toHaveBeenCalledWith(3, 1, -25, {});
  });

  test('claws back everything on a full refund', async () => {
    const order = {
      id: 5,
      user_id: 3,
      store_id: 1,
      total: '20.00',
      points_earned: 100,
    };

    const clawback = await loyaltyService.clawBackForRefund(order, 20, {});

    expect(clawback).toBe(100);
  });

  test('does nothing when the order never earned any points', async () => {
    const order = { id: 5, user_id: 3, store_id: 1, total: '20.00', points_earned: 0 };

    const clawback = await loyaltyService.clawBackForRefund(order, 20, {});

    expect(clawback).toBe(0);
    expect(loyaltyRepository.adjustBalance).not.toHaveBeenCalled();
  });
});
