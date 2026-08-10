jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock('../../src/repositories/orders.repository');
jest.mock('../../src/repositories/products.repository');
jest.mock('../../src/repositories/modifiers.repository');
jest.mock('../../src/repositories/stores.repository');
jest.mock('../../src/services/store-hours.service');
jest.mock('../../src/repositories/coupons.repository');
jest.mock('../../src/services/events.service');
jest.mock('../../src/services/payments.service');
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
const eventsService = require('../../src/services/events.service');
const paymentsService = require('../../src/services/payments.service');
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
    paymentsService.getPaymentsForOrder.mockResolvedValue([]);
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
      })
    );
  });

  test('still records a refund for a cash order with no gateway charge', async () => {
    paymentsService.refundPayment.mockResolvedValue(null);

    await ordersService.refundOrder(5, { id: 1, role: 'admin' }, { amount: 5 });

    expect(ordersRepository.insertRefund).toHaveBeenCalledWith(
      expect.objectContaining({ providerTransactionId: null })
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
});
