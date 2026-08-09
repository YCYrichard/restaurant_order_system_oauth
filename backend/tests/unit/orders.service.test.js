jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock('../../src/repositories/orders.repository');

const db = require('../../src/config/db');
const ordersRepository = require('../../src/repositories/orders.repository');
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
