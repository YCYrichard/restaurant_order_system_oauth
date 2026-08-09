jest.mock('../../src/repositories/coupons.repository');
jest.mock('../../src/repositories/stores.repository');

const couponsRepository = require('../../src/repositories/coupons.repository');
const couponsService = require('../../src/services/coupons.service');

function coupon(overrides = {}) {
  return {
    id: 1,
    code: 'SAVE10',
    store_id: null,
    discount_type: 'percent',
    discount_value: 10,
    min_order_total: 0,
    max_redemptions: null,
    redemption_count: 0,
    starts_at: null,
    expires_at: null,
    is_active: 1,
    ...overrides,
  };
}

describe('coupons.service.resolveDiscount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    couponsRepository.countRedemptionsByUser.mockResolvedValue(0);
  });

  test('rejects an unknown code', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(null);

    await expect(
      couponsService.resolveDiscount({ code: 'NOPE', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('That coupon code is not valid');
  });

  test('normalizes the code to uppercase before lookup', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(coupon());

    await couponsService.resolveDiscount({
      code: '  save10 ',
      storeId: 1,
      subtotal: 50,
    });

    expect(couponsRepository.findCouponByCode).toHaveBeenCalledWith(
      'SAVE10',
      undefined
    );
  });

  test('rejects an inactive coupon', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ is_active: 0 })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('no longer active');
  });

  test("rejects a coupon scoped to a different store", async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ store_id: 99 })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('not valid at this store');
  });

  test('accepts a global coupon at any store', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ store_id: null })
    );

    const result = await couponsService.resolveDiscount({
      code: 'SAVE10',
      storeId: 7,
      subtotal: 50,
    });

    expect(result.discountAmount).toBe(5);
  });

  test('rejects an expired coupon', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ expires_at: new Date(Date.now() - 1000) })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('has expired');
  });

  test('rejects a coupon that has not started yet', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ starts_at: new Date(Date.now() + 60000) })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('not active yet');
  });

  test('rejects a coupon at its redemption limit', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ max_redemptions: 5, redemption_count: 5 })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('redemption limit');
  });

  test('enforces the minimum order total', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ min_order_total: 100 })
    );

    await expect(
      couponsService.resolveDiscount({ code: 'SAVE10', storeId: 1, subtotal: 50 })
    ).rejects.toThrow('minimum order of 100.00');
  });

  test('rejects a second use by the same signed-in user', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(coupon());
    couponsRepository.countRedemptionsByUser.mockResolvedValue(1);

    await expect(
      couponsService.resolveDiscount({
        code: 'SAVE10',
        storeId: 1,
        subtotal: 50,
        userId: 3,
      })
    ).rejects.toThrow('already used that coupon');
  });

  test('does not apply per-user limits to guests', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(coupon());

    const result = await couponsService.resolveDiscount({
      code: 'SAVE10',
      storeId: 1,
      subtotal: 50,
    });

    expect(couponsRepository.countRedemptionsByUser).not.toHaveBeenCalled();
    expect(result.discountAmount).toBe(5);
  });

  test('computes a fixed discount', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ discount_type: 'fixed', discount_value: 7.5 })
    );

    const result = await couponsService.resolveDiscount({
      code: 'SAVE10',
      storeId: 1,
      subtotal: 50,
    });

    expect(result.discountAmount).toBe(7.5);
  });

  test('never discounts below zero when a fixed coupon exceeds the order', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ discount_type: 'fixed', discount_value: 100 })
    );

    const result = await couponsService.resolveDiscount({
      code: 'SAVE10',
      storeId: 1,
      subtotal: 12.34,
    });

    expect(result.discountAmount).toBe(12.34);
  });

  test('rounds a percent discount to cents', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(
      coupon({ discount_value: 15 })
    );

    const result = await couponsService.resolveDiscount({
      code: 'SAVE10',
      storeId: 1,
      subtotal: 33.33,
    });

    expect(result.discountAmount).toBe(5.0);
  });
});

describe('coupons.service.createCoupon validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    couponsRepository.findCouponByCode.mockResolvedValue(null);
    couponsRepository.insertCoupon.mockResolvedValue(1);
    couponsRepository.findCouponById.mockResolvedValue(coupon());
  });

  test('requires a code', async () => {
    await expect(
      couponsService.createCoupon({ discountType: 'percent', discountValue: 10 })
    ).rejects.toThrow('Coupon code is required');
  });

  test('rejects an unknown discount type', async () => {
    await expect(
      couponsService.createCoupon({
        code: 'X',
        discountType: 'buy-one-get-one',
        discountValue: 10,
      })
    ).rejects.toThrow('discountType must be one of');
  });

  test('rejects a percent discount over 100', async () => {
    await expect(
      couponsService.createCoupon({
        code: 'X',
        discountType: 'percent',
        discountValue: 150,
      })
    ).rejects.toThrow('cannot exceed 100');
  });

  test('rejects a non-positive discount value', async () => {
    await expect(
      couponsService.createCoupon({
        code: 'X',
        discountType: 'fixed',
        discountValue: 0,
      })
    ).rejects.toThrow('must be a positive number');
  });

  test('rejects a duplicate code', async () => {
    couponsRepository.findCouponByCode.mockResolvedValue(coupon());

    await expect(
      couponsService.createCoupon({
        code: 'SAVE10',
        discountType: 'percent',
        discountValue: 10,
      })
    ).rejects.toThrow('already exists');
  });

  test('uppercases the code on create', async () => {
    await couponsService.createCoupon({
      code: 'newyear',
      discountType: 'percent',
      discountValue: 10,
    });

    expect(couponsRepository.insertCoupon).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NEWYEAR' })
    );
  });
});
