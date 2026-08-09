jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock('../../src/repositories/orders.repository');
jest.mock('../../src/repositories/coupons.repository');
jest.mock('../../src/services/coupons.service', () => {
  const actual = jest.requireActual('../../src/services/coupons.service');
  return { ...actual, resolveDiscount: jest.fn() };
});

const db = require('../../src/config/db');
const ordersRepository = require('../../src/repositories/orders.repository');
const couponsRepository = require('../../src/repositories/coupons.repository');
const couponsService = require('../../src/services/coupons.service');
const ordersService = require('../../src/services/orders.service');

const validInput = {
  storeId: 1,
  items: [{ productId: 1, quantity: 2, price: 10 }],
  total: 20,
  customerName: 'Jane Doe',
  customerPhone: '0912345678',
};

describe('orders.service.createOrder', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

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

  test('rejects when total does not match item prices and quantities', async () => {
    const badInput = { ...validInput, total: 999 };

    await expect(ordersService.createOrder(badInput)).rejects.toThrow(
      'Order total does not match item prices and quantities'
    );

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('commits the transaction and returns the created order on success', async () => {
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue(undefined);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42, items: [] });

    const result = await ordersService.createOrder(validInput);

    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 1, total: 20 }),
      mockConnection
    );
    expect(ordersRepository.insertOrderItems).toHaveBeenCalledWith(
      42,
      validInput.items,
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

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue(undefined);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
  });

  test('rejects an unknown fulfillmentType', async () => {
    await expect(
      ordersService.createOrder({ ...validInput, fulfillmentType: 'teleport' })
    ).rejects.toThrow(/fulfillmentType must be one of/);

    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('requires a delivery address for delivery orders', async () => {
    await expect(
      ordersService.createOrder({
        ...validInput,
        fulfillmentType: 'delivery',
        deliveryAddress: '   ',
      })
    ).rejects.toThrow(/delivery address is required/);

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

  test('persists a trimmed delivery address for delivery orders', async () => {
    await ordersService.createOrder({
      ...validInput,
      fulfillmentType: 'delivery',
      deliveryAddress: '  12 Main St  ',
    });

    expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentType: 'delivery',
        deliveryAddress: '12 Main St',
      }),
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
      items,
      mockConnection
    );
  });
});

describe('orders.service.createOrder coupon handling', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection.mockResolvedValue(mockConnection);
    ordersRepository.insertOrder.mockResolvedValue(42);
    ordersRepository.insertOrderItems.mockResolvedValue(undefined);
    ordersRepository.findOrderWithItems.mockResolvedValue({ id: 42 });
    couponsRepository.incrementRedemptionCount.mockResolvedValue(true);
    couponsRepository.insertRedemption.mockResolvedValue(undefined);
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
