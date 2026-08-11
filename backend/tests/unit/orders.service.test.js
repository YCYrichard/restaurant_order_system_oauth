jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock('../../src/repositories/orders.repository');
jest.mock('../../src/repositories/products.repository');
jest.mock('../../src/repositories/modifiers.repository');
jest.mock('../../src/repositories/stores.repository');
jest.mock('../../src/services/store-hours.service', () => {
  const actual = jest.requireActual('../../src/services/store-hours.service');
  // localTimeIn is a pure timezone calculation - kept real so
  // resolveDesiredReadyAt's own date-math tests are genuinely exercised,
  // not just asserting against another mock. getStoreOpenState stays
  // mocked, as every existing test here already relies on controlling it.
  return { ...actual, getStoreOpenState: jest.fn() };
});
jest.mock('../../src/repositories/coupons.repository');
jest.mock('../../src/repositories/loyalty.repository');
jest.mock('../../src/services/events.service');
jest.mock('../../src/services/payments.service');
jest.mock('../../src/services/notifications.service');
jest.mock('../../src/services/coupons.service', () => {
  const actual = jest.requireActual('../../src/services/coupons.service');
  return { ...actual, resolveDiscount: jest.fn() };
});

const db = require('../../src/config/db');
const ordersRepository = require('../../src/repositories/orders.repository');
const productsRepository = require('../../src/repositories/products.repository');
const modifiersRepository = require('../../src/repositories/modifiers.repository');
const storesRepository = require('../../src/repositories/stores.repository');
const storeHoursService = require('../../src/services/store-hours.service');
const couponsRepository = require('../../src/repositories/coupons.repository');
const couponsService = require('../../src/services/coupons.service');
const loyaltyRepository = require('../../src/repositories/loyalty.repository');
const eventsService = require('../../src/services/events.service');
const paymentsService = require('../../src/services/payments.service');
const notificationsService = require('../../src/services/notifications.service');
const ordersService = require('../../src/services/orders.service');

const validInput = {
  storeId: 1,
  items: [{ productId: 1, quantity: 2, price: 10 }],
  total: 20,
  customerName: 'Jane Doe',
  customerPhone: '0912345678',
};

// validInput's single line is productId 1 x2 at 10 = 20, so the store's
// own price must agree or every createOrder test would trip the new
// stale-cart check.
function mockCatalog(overrides = {}) {
  productsRepository.findProductsByIds.mockResolvedValue([
    { id: 1, store_id: 1, name: 'Test Product', price: 10, is_active: 1, ...overrides },
  ]);

  // createOrder now resolves the store and checks opening hours before
  // pricing, so both need to succeed for the pricing paths to be reached.
  storesRepository.findStoreById.mockResolvedValue({
    id: 1,
    name: 'Test Store',
    timezone: 'Asia/Taipei',
  });
  storeHoursService.getStoreOpenState.mockResolvedValue({
    isOpen: true,
    reason: null,
  });

  // No modifier groups by default; the modifier-specific behaviour has its
  // own suite in modifiers.service.test.js.
  modifiersRepository.findGroupsForProducts.mockResolvedValue([]);
  modifiersRepository.groupRowsByProduct.mockReturnValue(new Map());
  modifiersRepository.insertOrderItemModifiers.mockResolvedValue(undefined);
}

describe('orders.service.createOrder', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
  });

  test('rejects missing required fields before opening a connection', async () => {
    await expect(ordersService.createOrder({})).rejects.toThrow(
      ordersService.OrderValidationError
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects a cart whose total disagrees with the store\'s prices', async () => {
    const badInput = { ...validInput, total: 999 };

    await expect(ordersService.createOrder(badInput)).rejects.toThrow(
      /Prices have changed/
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  // The vulnerability this phase closes: previously the server only checked
  // the client's total against the client's own prices, so both could be
  // forged together and an 8.90 item bought for 0.01.
  test('refuses a forged low price even when the total agrees with it', async () => {
    await expect(
      ordersService.createOrder({
        ...validInput,
        items: [{ productId: 1, quantity: 1, price: 0.01 }],
        total: 0.01,
      })
    ).rejects.toThrow(/Prices have changed/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('prices the order from the store, ignoring what the client sent', async () => {
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });

    // Client claims a lower unit price but a total matching the real one.
    await ordersService.createOrder({
      ...validInput,
      items: [{ productId: 1, quantity: 2, price: 1 }],
      total: 20,
    });

    expect(ordersRepository.insertOrderItems).toHaveBeenCalledWith(
      42,
      [expect.objectContaining({ productId: 1, quantity: 2, price: 10 })],
      mockConnection
    );
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ total: 20 }),
      mockConnection
    );
  });

  test('rejects a non-integer quantity', async () => {
    await expect(
      ordersService.createOrder({
        ...validInput,
        items: [{ productId: 1, quantity: 1.5, price: 15 }],
        total: 15,
      })
    ).rejects.toThrow(/quantity between 1 and/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects a quantity above the sane ceiling', async () => {
    await expect(
      ordersService.createOrder({
        ...validInput,
        items: [{ productId: 1, quantity: 101, price: 1010 }],
        total: 1010,
      })
    ).rejects.toThrow(/quantity between 1 and/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  // The vulnerability this closes: a modifier option's price_delta can be
  // negative (e.g. "smaller size"), and groups are shared across products -
  // a delta calibrated for an expensive item would otherwise make a cheap
  // item's line price negative, and an unbounded quantity would multiply
  // that into a large negative subtotal.
  test('floors a line price at zero when a modifier delta exceeds the product price', async () => {
    mockCatalog();
    modifiersRepository.groupRowsByProduct.mockReturnValue(
      new Map([
        [1, new Map([[1, {
          id: 1, name: 'Size', min_select: 1, max_select: 1, is_required: true,
          options: [{ id: 1, name: 'Small', price_delta: -50, is_active: true }],
        }]])],
      ])
    );
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });

    await ordersService.createOrder({
      ...validInput,
      items: [{ productId: 1, quantity: 1, modifierOptionIds: [1] }],
      // A literal 0 trips validateCreateOrderInput's own `!total` check
      // (an unrelated, pre-existing falsy-zero quirk) - close enough to
      // stay within the staleness tolerance against the real total of 0.
      total: 0.001,
    });

    expect(ordersRepository.insertOrderItems).toHaveBeenCalledWith(
      42,
      [expect.objectContaining({ price: 0 })],
      mockConnection
    );
  });

  test('rejects a product that belongs to another store', async () => {
    // Scoped lookup returns nothing for a foreign product id.
    productsRepository.findProductsByIds.mockResolvedValue([]);

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      /is not available at this store/
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects an inactive product', async () => {
    mockCatalog({ is_active: 0, name: 'Retired Burger' });

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      /Retired Burger is no longer available/
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects an item the kitchen has 86\'d, even from a stale cart', async () => {
    mockCatalog({ is_eighty_sixed: 1, name: 'Sold Out Special' });

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      /Sold Out Special has just sold out/
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('refuses orders while the store is closed', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: false,
      reason: 'Closed on Monday',
    });

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      ordersService.StoreClosedError
    );

    // Rejected before any pricing or connection work.
    expect(productsRepository.findProductsByIds).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects an order for a store that does not exist', async () => {
    storesRepository.findStoreById.mockResolvedValue(null);

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      /store does not exist/
    );
  });

  test('commits the transaction and returns the created order on success', async () => {
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42, items: [] });

    const result = await ordersService.createOrder(validInput);

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 1, total: 20 }),
      mockConnection
    );
    expect(ordersRepository.insertOrderItems).toHaveBeenCalledWith(
      42,
      [expect.objectContaining({ productId: 1, quantity: 2, price: 10 })],
      mockConnection
    );
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(result).toEqual({ id: 42, items: [] });
  });

  test('rolls back and releases the connection if inserting items fails', async () => {
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockRejectedValue(new Error('DB exploded'));

    await expect(ordersService.createOrder(validInput)).rejects.toThrow(
      'DB exploded'
    );

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
    expect(ordersRepository.findOrderWithItems).not.toHaveBeenCalled();
  });
});

describe('orders.service.createOrder fulfillment + item notes', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
  });

  test('rejects an unknown fulfillmentType', async () => {
    await expect(
      ordersService.createOrder({ ...validInput, fulfillmentType: 'teleport' })
    ).rejects.toThrow(/fulfillmentType must be one of/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects delivery - it is no longer an offered fulfillment type', async () => {
    await expect(
      ordersService.createOrder({
        ...validInput,
        fulfillmentType: 'delivery',
      })
    ).rejects.toThrow(/fulfillmentType must be one of/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('defaults to pickup and nulls the address when unspecified', async () => {
    await ordersService.createOrder(validInput);

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentType: 'pickup',
        deliveryAddress: null,
      }),
      mockConnection
    );
  });

  test('never persists a delivery address, even if the client sends one', async () => {
    await ordersService.createOrder({
      ...validInput,
      deliveryAddress: '12 Main St',
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryAddress: null }),
      mockConnection
    );
  });

  test('requires a valid table number for dine-in orders', async () => {
    await expect(
      ordersService.createOrder({ ...validInput, fulfillmentType: 'dine_in' })
    ).rejects.toThrow(/table number is required/);

    await expect(
      ordersService.createOrder({
        ...validInput,
        fulfillmentType: 'dine_in',
        tableNumber: 0,
      })
    ).rejects.toThrow(/table number is required/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('persists the table number for dine-in orders', async () => {
    await ordersService.createOrder({
      ...validInput,
      fulfillmentType: 'dine_in',
      tableNumber: '5',
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentType: 'dine_in',
        tableNumber: 5,
        deliveryAddress: null,
      }),
      mockConnection
    );
  });

  test('does not carry a table number on non-dine-in orders', async () => {
    await ordersService.createOrder({ ...validInput, tableNumber: 9 });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ tableNumber: null }),
      mockConnection
    );
  });

  test('passes per-item notes through to the repository', async () => {
    const items = [
      { productId: 1, quantity: 2, price: 10, notes: 'No onions' },
    ];

    await ordersService.createOrder({ ...validInput, items });

    expect(ordersRepository.insertOrderItems).toHaveBeenCalledWith(
      42,
      [expect.objectContaining({ productId: 1, notes: 'No onions' })],
      mockConnection
    );
  });
});

describe('orders.service.createOrder desired ready time', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();
    jest.useFakeTimers();
    // 10:30 Monday in Taipei - comfortably clear of any local midnight
    // boundary, so date-math around it isn't flaky.
    jest.setSystemTime(new Date('2026-08-10T02:30:00Z'));

    storesRepository.findStoreById.mockResolvedValue({
      id: 1,
      name: 'Test Store',
      timezone: 'Asia/Taipei',
      min_prep_minutes: 15,
    });

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('defaults to ASAP (null) when not specified', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: null,
    });

    await ordersService.createOrder(validInput);

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ desiredReadyAt: null }),
      mockConnection
    );
  });

  test('rejects a time earlier than the store\'s minimum prep window', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: null,
    });

    await expect(
      ordersService.createOrder({
        ...validInput,
        // 1 second from now - nowhere close to the 15-minute minimum.
        desiredReadyAt: new Date(Date.now() + 1000).toISOString(),
      })
    ).rejects.toThrow(/needs at least 15 minutes/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('rejects a malformed date', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: null,
    });

    await expect(
      ordersService.createOrder({ ...validInput, desiredReadyAt: 'not-a-date' })
    ).rejects.toThrow(/must be a valid date/);
  });

  test('accepts a time after the prep window, within an unbounded (always-open) day', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: null,
    });

    const readyAt = new Date(Date.now() + 30 * 60000); // 30 min from now

    await ordersService.createOrder({
      ...validInput,
      desiredReadyAt: readyAt.toISOString(),
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ desiredReadyAt: readyAt }),
      mockConnection
    );
  });

  test('rejects scheduling for a different calendar day', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: null,
    });

    // Now is 10:30 Monday Taipei - 20 hours out lands on Tuesday.
    const tomorrow = new Date(Date.now() + 20 * 60 * 60000);

    await expect(
      ordersService.createOrder({
        ...validInput,
        desiredReadyAt: tomorrow.toISOString(),
      })
    ).rejects.toThrow(/later today/);
  });

  test('rejects a time after closing', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: { open: '09:00', close: '11:00' },
    });

    // Now is 10:30 Taipei; 11:15 is after the 11:00 close.
    const afterClose = new Date('2026-08-10T03:15:00Z');

    await expect(
      ordersService.createOrder({
        ...validInput,
        desiredReadyAt: afterClose.toISOString(),
      })
    ).rejects.toThrow(/closes at 11:00 today/);
  });

  test('accepts a time at or before closing', async () => {
    storeHoursService.getStoreOpenState.mockResolvedValue({
      isOpen: true,
      reason: null,
      todayHours: { open: '09:00', close: '17:00' },
    });

    const readyAt = new Date('2026-08-10T08:00:00Z'); // 16:00 Taipei

    await ordersService.createOrder({
      ...validInput,
      desiredReadyAt: readyAt.toISOString(),
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ desiredReadyAt: readyAt }),
      mockConnection
    );
  });
});

describe('orders.service.createOrder coupon handling', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
    couponsRepository.incrementRedemptionCount.mockResolvedValue(true);
    couponsRepository.insertRedemption.mockResolvedValue(undefined);
  });

  test('publishes order.created only after the transaction commits', async () => {
    await ordersService.createOrder({ ...validInput, userId: 3 });

    expect(mockConnection.commit).toHaveBeenCalled();
    expect(eventsService.publishOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order.created',
        storeId: 1,
        userId: 3,
      })
    );
  });

  test('publishes nothing when the order rolls back', async () => {
    ordersRepository.insertOrderItems.mockRejectedValue(new Error('boom'));

    await expect(ordersService.createOrder(validInput)).rejects.toThrow('boom');

    // A kitchen must never be shown a ticket for an order that failed.
    expect(eventsService.publishOrderEvent).not.toHaveBeenCalled();
  });

  test('stores no discount when no coupon code is supplied', async () => {
    await ordersService.createOrder(validInput);

    expect(couponsService.resolveDiscount).not.toHaveBeenCalled();
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 20,
        discountAmount: 0,
        couponCode: null,
      }),
      mockConnection
    );
  });

  test('ignores any client-supplied discount and derives it from the code', async () => {
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE10' },
      discountAmount: 2,
    });

    // A client trying to dictate its own discount/total should have no
    // effect - the server recomputes both.
    await ordersService.createOrder({
      ...validInput,
      couponCode: 'save10',
      discountAmount: 19.99,
    });

    expect(couponsService.resolveDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'save10', subtotal: 20 }),
      mockConnection
    );
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 18,
        discountAmount: 2,
        couponCode: 'SAVE10',
      }),
      mockConnection
    );
  });

  test('records a redemption row for the applied coupon', async () => {
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE10' },
      discountAmount: 2,
    });

    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      couponCode: 'SAVE10',
    });

    expect(couponsRepository.insertRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        couponId: 7,
        orderId: 42,
        userId: 3,
        discountAmount: 2,
      }),
      mockConnection
    );
  });

  test('rolls back if the coupon hits its cap between resolution and reservation', async () => {
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE10' },
      discountAmount: 2,
    });
    couponsRepository.incrementRedemptionCount.mockResolvedValue(false);

    await expect(
      ordersService.createOrder({ ...validInput, couponCode: 'SAVE10' })
    ).rejects.toThrow('redemption limit');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(ordersRepository.insertOrder).not.toHaveBeenCalled();
  });

  // The race this closes: countRedemptionsByUser is a plain SELECT COUNT
  // with no locking read - two concurrent checkouts can both pass that
  // check before either commits. The UNIQUE(coupon_id, user_id) constraint
  // is the real backstop; this confirms the resulting duplicate-key error
  // surfaces as a clean validation error, not a raw 500.
  test('translates a duplicate-key race on redemption into a clean coupon error', async () => {
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE10' },
      discountAmount: 2,
    });

    const dupError = new Error("Duplicate entry '7-3' for key 'unique_coupon_redemption_per_user'");
    dupError.code = 'ER_DUP_ENTRY';
    couponsRepository.insertRedemption.mockRejectedValue(dupError);

    await expect(
      ordersService.createOrder({ ...validInput, userId: 3, couponCode: 'SAVE10' })
    ).rejects.toThrow('You have already used that coupon');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
  });

  test('rolls back when the coupon itself is rejected', async () => {
    couponsService.resolveDiscount.mockRejectedValue(
      new couponsService.CouponValidationError('That coupon has expired')
    );

    await expect(
      ordersService.createOrder({ ...validInput, couponCode: 'OLD' })
    ).rejects.toThrow('That coupon has expired');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(ordersRepository.insertOrder).not.toHaveBeenCalled();
  });
});

describe('orders.service.createOrder loyalty redemption', () => {
  let mockConnection;

  function loyaltyStore(overrides = {}) {
    return {
      id: 1,
      name: 'Test Store',
      timezone: 'Asia/Taipei',
      loyalty_enabled: true,
      loyalty_points_per_dollar: '1.00',
      loyalty_point_value: '0.01',
      loyalty_stackable_with_coupons: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();
    storeHoursService.getStoreOpenState.mockResolvedValue({ isOpen: true, reason: null });

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
  });

  test('redeems points up to the order balance when requested', async () => {
    storesRepository.findStoreById.mockResolvedValue(loyaltyStore());
    loyaltyRepository.findBalance.mockResolvedValue(500);
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(true);

    // total is the pre-discount staleness check against the raw item
    // subtotal (20), not the post-discount figure - matches the existing
    // coupon tests' pattern (input.total stays the raw subtotal; the
    // server-computed final total is asserted separately below).
    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      redeemPoints: true,
      total: 20,
    });

    expect(loyaltyRepository.debitBalanceIfSufficient).toHaveBeenCalledWith(
      3,
      1,
      500,
      mockConnection
    );
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        pointsRedeemed: 500,
        pointsDiscountAmount: 5,
        total: 15,
      }),
      mockConnection
    );
  });

  test('does not redeem when the store has loyalty disabled', async () => {
    storesRepository.findStoreById.mockResolvedValue(loyaltyStore({ loyalty_enabled: false }));

    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      redeemPoints: true,
      total: 20,
    });

    expect(loyaltyRepository.findBalance).not.toHaveBeenCalled();
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ pointsRedeemed: 0, pointsDiscountAmount: 0 }),
      mockConnection
    );
  });

  test('does not redeem when redeemPoints was not requested', async () => {
    storesRepository.findStoreById.mockResolvedValue(loyaltyStore());

    await ordersService.createOrder({ ...validInput, userId: 3, total: 20 });

    expect(loyaltyRepository.findBalance).not.toHaveBeenCalled();
  });

  // Stacking is opt-in per store (stores.loyalty_stackable_with_coupons) -
  // real platforms researched treat "coupon + points on one order" as a
  // merchant decision, not a universal default.
  test('skips redemption when a coupon already applied and stacking is off', async () => {
    storesRepository.findStoreById.mockResolvedValue(
      loyaltyStore({ loyalty_stackable_with_coupons: false })
    );
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE5' },
      discountAmount: 5,
    });
    couponsRepository.incrementRedemptionCount.mockResolvedValue(true);

    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      couponCode: 'SAVE5',
      redeemPoints: true,
      total: 20,
    });

    expect(loyaltyRepository.findBalance).not.toHaveBeenCalled();
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ discountAmount: 5, pointsRedeemed: 0 }),
      mockConnection
    );
  });

  test('stacks points on top of a coupon when the store allows it', async () => {
    storesRepository.findStoreById.mockResolvedValue(
      loyaltyStore({ loyalty_stackable_with_coupons: true })
    );
    couponsService.resolveDiscount.mockResolvedValue({
      coupon: { id: 7, code: 'SAVE5' },
      discountAmount: 5,
    });
    couponsRepository.incrementRedemptionCount.mockResolvedValue(true);
    loyaltyRepository.findBalance.mockResolvedValue(200);
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(true);

    // subtotal 20, coupon takes 5 -> 15 remaining, 200 points at $0.01 = $2,
    // final total = 20 - 5 - 2 = 13. input.total stays the raw subtotal (20).
    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      couponCode: 'SAVE5',
      redeemPoints: true,
      total: 20,
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        discountAmount: 5,
        pointsRedeemed: 200,
        pointsDiscountAmount: 2,
        total: 13,
      }),
      mockConnection
    );
  });

  // The race this closes: two concurrent checkouts both resolving against
  // the same stale balance before either's debit commits.
  test('rolls back when the points balance changed before the debit landed', async () => {
    storesRepository.findStoreById.mockResolvedValue(loyaltyStore());
    loyaltyRepository.findBalance.mockResolvedValue(500);
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(false);

    await expect(
      ordersService.createOrder({
        ...validInput,
        userId: 3,
        redeemPoints: true,
        total: 20,
      })
    ).rejects.toThrow(/balance changed/);

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(ordersRepository.insertOrder).not.toHaveBeenCalled();
  });

  test('records a redeem ledger entry for the applied points', async () => {
    storesRepository.findStoreById.mockResolvedValue(loyaltyStore());
    loyaltyRepository.findBalance.mockResolvedValue(500);
    loyaltyRepository.debitBalanceIfSufficient.mockResolvedValue(true);

    await ordersService.createOrder({
      ...validInput,
      userId: 3,
      redeemPoints: true,
      total: 20,
    });

    expect(loyaltyRepository.insertLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        storeId: 1,
        orderId: 42,
        type: 'redeem',
        pointsDelta: -500,
      }),
      mockConnection
    );
  });
});

describe('orders.service.createOrder e-invoicing', () => {
  let mockConnection;

  function einvoiceStore(overrides = {}) {
    return {
      id: 1,
      name: 'Test Store',
      timezone: 'Asia/Taipei',
      einvoice_enabled: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog();
    storeHoursService.getStoreOpenState.mockResolvedValue({ isOpen: true, reason: null });

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue([1001]);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
  });

  test('defaults to not_applicable when the store has not enabled e-invoicing', async () => {
    storesRepository.findStoreById.mockResolvedValue(einvoiceStore({ einvoice_enabled: false }));

    await ordersService.createOrder({ ...validInput, einvoiceBuyerTaxId: '12345678' });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        einvoiceStatus: 'not_applicable',
        einvoiceBuyerTaxId: null,
        einvoiceDonate: false,
      }),
      mockConnection
    );
  });

  test('marks the order pending with no buyer choice made', async () => {
    storesRepository.findStoreById.mockResolvedValue(einvoiceStore());

    await ordersService.createOrder({ ...validInput });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        einvoiceStatus: 'pending',
        einvoiceBuyerTaxId: null,
        einvoiceDonate: false,
      }),
      mockConnection
    );
  });

  test('carries a valid buyer tax ID through to the order', async () => {
    storesRepository.findStoreById.mockResolvedValue(einvoiceStore());

    await ordersService.createOrder({ ...validInput, einvoiceBuyerTaxId: '12345678' });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        einvoiceStatus: 'pending',
        einvoiceBuyerTaxId: '12345678',
      }),
      mockConnection
    );
  });

  test('rejects a buyer tax ID and donate set together, before opening a connection', async () => {
    storesRepository.findStoreById.mockResolvedValue(einvoiceStore());

    await expect(
      ordersService.createOrder({
        ...validInput,
        einvoiceBuyerTaxId: '12345678',
        einvoiceDonate: true,
      })
    ).rejects.toThrow(/not both/);
  });

  test('rejects a malformed buyer tax ID', async () => {
    storesRepository.findStoreById.mockResolvedValue(einvoiceStore());

    await expect(
      ordersService.createOrder({ ...validInput, einvoiceBuyerTaxId: '123' })
    ).rejects.toThrow(/8 digits/);
  });
});

describe('orders.service.issueEinvoice / voidEinvoice', () => {
  const pendingOrder = {
    id: 5,
    store_id: 10,
    user_id: 2,
    status: 'completed',
    total: '20.00',
    subtotal: '20.00',
    discount_amount: '0.00',
    tax_amount: '1.00',
    tax_rate: '0.05',
    tax_inclusive: 1,
    einvoice_status: 'pending',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ordersRepository.findOrderById.mockResolvedValue(pendingOrder);
    ordersRepository.findOrderWithItems.mockResolvedValue(pendingOrder);
    ordersRepository.findRefundsForOrder.mockResolvedValue([]);
    ordersRepository.setEinvoiceIssued.mockResolvedValue(true);
    ordersRepository.setEinvoiceVoid.mockResolvedValue(true);
    paymentsService.getPaymentsForOrder.mockResolvedValue([]);
  });

  test('records a valid invoice number obtained through the store\'s own system', async () => {
    await ordersService.issueEinvoice(5, { id: 1, role: 'admin' }, {
      einvoiceNumber: 'ab12345678',
    });

    expect(ordersRepository.setEinvoiceIssued).toHaveBeenCalledWith(5, 'AB12345678');
  });

  test('rejects a malformed invoice number', async () => {
    await expect(
      ordersService.issueEinvoice(5, { id: 1, role: 'admin' }, { einvoiceNumber: '12345' })
    ).rejects.toThrow(/two letters/);

    expect(ordersRepository.setEinvoiceIssued).not.toHaveBeenCalled();
  });

  test('refuses to issue against an order that is not pending', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      ...pendingOrder,
      einvoice_status: 'not_applicable',
    });

    await expect(
      ordersService.issueEinvoice(5, { id: 1, role: 'admin' }, { einvoiceNumber: 'AB12345678' })
    ).rejects.toThrow(/Cannot issue/);
  });

  test('requires owner-tier access to issue', async () => {
    ordersRepository.hasStoreAccess.mockResolvedValue('staff');

    await expect(
      ordersService.issueEinvoice(5, { id: 9, role: 'owner' }, { einvoiceNumber: 'AB12345678' })
    ).rejects.toThrow(ordersService.OrderAccessDeniedError);

    expect(ordersRepository.setEinvoiceIssued).not.toHaveBeenCalled();
  });

  test('voids a pending invoice', async () => {
    await ordersService.voidEinvoice(5, { id: 1, role: 'admin' });

    expect(ordersRepository.setEinvoiceVoid).toHaveBeenCalledWith(5);
  });

  test('voids an already-issued invoice too', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      ...pendingOrder,
      einvoice_status: 'issued',
    });

    await ordersService.voidEinvoice(5, { id: 1, role: 'admin' });

    expect(ordersRepository.setEinvoiceVoid).toHaveBeenCalledWith(5);
  });

  test('refuses to void an invoice that does not apply to this order', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      ...pendingOrder,
      einvoice_status: 'not_applicable',
    });

    await expect(
      ordersService.voidEinvoice(5, { id: 1, role: 'admin' })
    ).rejects.toThrow(/Cannot void/);
  });
});

describe('orders.service.updateOrderStatus', () => {
  const adminUser = { id: 1, role: 'admin' };
  const ownerUser = { id: 2, role: 'customer' };

  beforeEach(() => jest.clearAllMocks());

  test('rejects an invalid status value before touching the database', async () => {
    await expect(
      ordersService.updateOrderStatus(5, adminUser, 'not-a-real-status')
    ).rejects.toThrow(ordersService.OrderValidationError);

    expect(ordersRepository.findOrderById).not.toHaveBeenCalled();
  });

  test('throws OrderNotFoundError when the order does not exist', async () => {
    ordersRepository.findOrderById.mockResolvedValue(null);

    await expect(
      ordersService.updateOrderStatus(5, adminUser, 'confirmed')
    ).rejects.toThrow(ordersService.OrderNotFoundError);
  });

  test('throws OrderAccessDeniedError when a non-admin has no store access', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'pending',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(false);

    await expect(
      ordersService.updateOrderStatus(5, ownerUser, 'confirmed')
    ).rejects.toThrow(ordersService.OrderAccessDeniedError);
  });

  test('allows a valid forward transition', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'pending',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });

    const result = await ordersService.updateOrderStatus(
      5,
      ownerUser,
      'confirmed'
    );

    expect(ordersRepository.updateOrderStatus).toHaveBeenCalledWith(
      5,
      'confirmed'
    );
    expect(result).toEqual({ id: 5, status: 'confirmed' });
  });

  test('publishes a status_changed event so other screens and the customer update', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'pending',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });

    await ordersService.updateOrderStatus(5, ownerUser, 'confirmed');

    expect(eventsService.publishOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order.status_changed',
        storeId: 10,
        userId: 3,
      })
    );
  });

  test('notifies the customer when an order becomes ready', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'preparing',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'ready',
    });

    await ordersService.updateOrderStatus(5, ownerUser, 'ready');

    expect(notificationsService.notifyOrderReady).toHaveBeenCalledWith({
      id: 5,
      status: 'ready',
    });
  });

  test('does not notify for any other status change', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'pending',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });

    await ordersService.updateOrderStatus(5, ownerUser, 'confirmed');

    expect(notificationsService.notifyOrderReady).not.toHaveBeenCalled();
  });

  test('allows recalling one step back after a mis-bump', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'preparing',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });

    const result = await ordersService.updateOrderStatus(
      5,
      ownerUser,
      'confirmed'
    );

    expect(ordersRepository.updateOrderStatus).toHaveBeenCalledWith(
      5,
      'confirmed'
    );
    expect(result.status).toBe('confirmed');
  });

  test('rejects jumping more than one step backward', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'ready',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);

    await expect(
      ordersService.updateOrderStatus(5, ownerUser, 'pending')
    ).rejects.toThrow(/Cannot transition/);

    expect(ordersRepository.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('rejects skipping a step in the sequence', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'pending',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);

    await expect(
      ordersService.updateOrderStatus(5, ownerUser, 'ready')
    ).rejects.toThrow(/Cannot transition/);

    expect(ordersRepository.updateOrderStatus).not.toHaveBeenCalled();
  });

  test('allows cancelling from any non-terminal state', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'preparing',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'cancelled',
    });

    const result = await ordersService.updateOrderStatus(
      5,
      ownerUser,
      'cancelled'
    );

    expect(result.status).toBe('cancelled');
  });

  test('rejects any transition once an order is completed', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'completed',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);

    await expect(
      ordersService.updateOrderStatus(5, ownerUser, 'cancelled')
    ).rejects.toThrow(/Cannot transition/);
  });

  test('earns loyalty points when an order completes at a loyalty-enabled store', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'ready',
      subtotal: '15.00',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 5, status: 'completed' });
    storesRepository.findStoreById.mockResolvedValue({
      id: 10,
      loyalty_enabled: true,
      loyalty_points_per_dollar: '1.00',
    });

    await ordersService.updateOrderStatus(5, ownerUser, 'completed');

    expect(loyaltyRepository.adjustBalance).toHaveBeenCalledWith(3, 10, 15, undefined);
    expect(ordersRepository.setPointsEarned).toHaveBeenCalledWith(5, 15);
  });

  // The key lifecycle decision this locks in: earning is keyed off order
  // STATUS, never payment_status. A cash/manual order (likely the majority
  // for this app's target restaurants) never reaches payment_status
  // 'paid' at all - gating on that instead would silently break earning
  // for most real orders.
  test('still earns points for a cash order whose payment_status stays unpaid', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'ready',
      subtotal: '15.00',
      payment_status: 'unpaid',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 5, status: 'completed' });
    storesRepository.findStoreById.mockResolvedValue({
      id: 10,
      loyalty_enabled: true,
      loyalty_points_per_dollar: '1.00',
    });

    await ordersService.updateOrderStatus(5, ownerUser, 'completed');

    expect(loyaltyRepository.adjustBalance).toHaveBeenCalledWith(3, 10, 15, undefined);
  });

  test('does not earn points when the store has loyalty disabled', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      user_id: 3,
      status: 'ready',
      subtotal: '15.00',
    });
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 5, status: 'completed' });
    storesRepository.findStoreById.mockResolvedValue({ id: 10, loyalty_enabled: false });

    await ordersService.updateOrderStatus(5, ownerUser, 'completed');

    expect(loyaltyRepository.adjustBalance).not.toHaveBeenCalled();
    expect(ordersRepository.setPointsEarned).not.toHaveBeenCalled();
  });

  test('an admin bypasses the store-access check entirely', async () => {
    ordersRepository.findOrderById.mockResolvedValue({
      id: 5,
      store_id: 10,
      status: 'pending',
    });
    ordersRepository.updateOrderStatus.mockResolvedValue(true);
    ordersRepository.findOrderWithItems.mockResolvedValue({
      id: 5,
      status: 'confirmed',
    });

    await ordersService.updateOrderStatus(5, adminUser, 'confirmed');

    expect(ordersRepository.hasStoreAccess).not.toHaveBeenCalled();
  });
});

describe('orders.service.listOrdersForStore', () => {
  beforeEach(() => jest.clearAllMocks());

  test('denies a non-admin with no access to the store', async () => {
    ordersRepository.hasStoreAccess.mockResolvedValue(false);

    await expect(
      ordersService.listOrdersForStore(10, { id: 2, role: 'customer' })
    ).rejects.toThrow(ordersService.OrderAccessDeniedError);

    expect(ordersRepository.findOrdersByStore).not.toHaveBeenCalled();
  });

  test('returns orders for an admin without checking store access', async () => {
    ordersRepository.findOrdersByStore.mockResolvedValue([{ id: 1 }]);

    const result = await ordersService.listOrdersForStore(10, {
      id: 1,
      role: 'admin',
    });

    expect(ordersRepository.hasStoreAccess).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 1 }]);
  });

  test('defaults to returning every order', async () => {
    ordersRepository.findOrdersByStore.mockResolvedValue([]);

    await ordersService.listOrdersForStore(10, { id: 1, role: 'admin' });

    expect(ordersRepository.findOrdersByStore).toHaveBeenCalledWith(10, {
      activeOnly: false,
    });
  });

  test('passes activeOnly through for the kitchen display', async () => {
    ordersRepository.findOrdersByStore.mockResolvedValue([]);

    await ordersService.listOrdersForStore(
      10,
      { id: 1, role: 'admin' },
      { activeOnly: true }
    );

    expect(ordersRepository.findOrdersByStore).toHaveBeenCalledWith(10, {
      activeOnly: true,
    });
  });
});

describe('orders.service.getReceipt', () => {
  beforeEach(() => jest.clearAllMocks());

  const order = {
    id: 5,
    store_id: 10,
    user_id: 2,
    subtotal: '20.00',
    discount_amount: '0.00',
    tax_amount: '1.00',
    tax_rate: '0.05',
    tax_inclusive: 1,
    total: '20.00',
  };

  test('is readable by the ordering customer', async () => {
    ordersRepository.findOrderWithItems.mockResolvedValue(order);
    ordersRepository.findRefundsForOrder.mockResolvedValue([]);
    paymentsService.getPaymentsForOrder.mockResolvedValue([]);

    const receipt = await ordersService.getReceipt(5, { id: 2, role: 'customer' });

    expect(receipt.totals.total).toBe(20);
    expect(receipt.payments).toEqual([]);
  });

  test('denies a customer who does not own the order and has no store access', async () => {
    ordersRepository.findOrderWithItems.mockResolvedValue(order);
    ordersRepository.hasStoreAccess.mockResolvedValue(false);

    await expect(
      ordersService.getReceipt(5, { id: 99, role: 'customer' })
    ).rejects.toThrow(ordersService.OrderAccessDeniedError);
  });

  test('is readable by staff with store access even if not the buyer', async () => {
    ordersRepository.findOrderWithItems.mockResolvedValue(order);
    ordersRepository.hasStoreAccess.mockResolvedValue(true);
    ordersRepository.findRefundsForOrder.mockResolvedValue([]);
    paymentsService.getPaymentsForOrder.mockResolvedValue([]);

    await expect(
      ordersService.getReceipt(5, { id: 99, role: 'staff' })
    ).resolves.toMatchObject({ order });
  });

  test('includes payments and nets out refunds', async () => {
    ordersRepository.findOrderWithItems.mockResolvedValue(order);
    ordersRepository.findRefundsForOrder.mockResolvedValue([
      { id: 1, amount: '5.00' },
    ]);
    paymentsService.getPaymentsForOrder.mockResolvedValue([
      { id: 1, provider: 'tappay', status: 'paid', amount: '20.00' },
    ]);

    const receipt = await ordersService.getReceipt(5, { id: 2, role: 'customer' });

    expect(receipt.totals.refunded).toBe(5);
    expect(receipt.totals.net).toBe(15);
    expect(receipt.payments).toHaveLength(1);
  });
});

describe('orders.service.refundOrder', () => {
  let mockConnection;

  beforeEach(() => jest.clearAllMocks());

  const order = {
    id: 5,
    store_id: 10,
    user_id: 2,
    status: 'completed',
    total: '20.00',
    subtotal: '20.00',
    discount_amount: '0.00',
    tax_amount: '1.00',
    tax_rate: '0.05',
    tax_inclusive: 1,
  };

  beforeEach(() => {
    ordersRepository.findOrderById.mockResolvedValue(order);
    ordersRepository.findOrderWithItems.mockResolvedValue(order);
    ordersRepository.sumRefundsForOrder.mockResolvedValue(0);
    ordersRepository.findRefundsForOrder.mockResolvedValue([]);
    ordersRepository.insertRefund.mockResolvedValue(1);
    ordersRepository.lockOrderRow.mockResolvedValue({ id: 5, total: '20.00' });
    paymentsService.getPaymentsForOrder.mockResolvedValue([]);

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
  });

  test('sends the refund to the gateway before recording it', async () => {
    paymentsService.refundPayment.mockResolvedValue({
      providerTransactionId: 'TXN1',
    });

    await ordersService.refundOrder(5, { id: 1, role: 'admin' }, {
      amount: 5,
      reason: 'Customer complaint',
    });

    expect(paymentsService.refundPayment).toHaveBeenCalledWith(5, 5);
    expect(ordersRepository.insertRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 5,
        amount: 5,
        providerTransactionId: 'TXN1',
      }),
      expect.anything()
    );
  });

  test('still records a refund for a cash order with no gateway charge', async () => {
    paymentsService.refundPayment.mockResolvedValue(null);

    await ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 });

    expect(ordersRepository.insertRefund).toHaveBeenCalledWith(
      expect.objectContaining({ providerTransactionId: null }),
      expect.anything()
    );
  });

  test('does not touch the ledger when the gateway rejects the refund', async () => {
    paymentsService.refundPayment.mockRejectedValue(new Error('Gateway down'));

    await expect(
      ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 })
    ).rejects.toThrow('Gateway down');

    expect(ordersRepository.insertRefund).not.toHaveBeenCalled();
  });

  test('rejects a refund larger than the remaining balance', async () => {
    ordersRepository.sumRefundsForOrder.mockResolvedValue(18);

    await expect(
      ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 })
    ).rejects.toThrow(/remaining balance/);

    expect(paymentsService.refundPayment).not.toHaveBeenCalled();
  });

  test('rejects a non-positive amount', async () => {
    await expect(
      ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 0 })
    ).rejects.toThrow(ordersService.OrderValidationError);
  });

  test('claws back earned points proportional to the refund amount', async () => {
    ordersRepository.findOrderById.mockResolvedValue({ ...order, points_earned: 20 });
    paymentsService.refundPayment.mockResolvedValue(null);

    // 5 of a 20.00 total refunded (25%) -> 5 of 20 points clawed back.
    await ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 });

    expect(loyaltyRepository.adjustBalance).toHaveBeenCalledWith(2, 10, -5, mockConnection);
  });

  test('does not touch the loyalty ledger when the order never earned points', async () => {
    paymentsService.refundPayment.mockResolvedValue(null);

    await ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 });

    expect(loyaltyRepository.adjustBalance).not.toHaveBeenCalled();
  });
});
