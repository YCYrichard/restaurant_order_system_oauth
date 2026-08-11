const eventsService = require('../../src/services/events.service');

describe('events.service', () => {
  test('delivers a store event to that store\'s subscribers only', () => {
    const storeOne = jest.fn();
    const storeTwo = jest.fn();

    const unsubOne = eventsService.subscribeToStore(1, storeOne);
    const unsubTwo = eventsService.subscribeToStore(2, storeTwo);

    eventsService.publishOrderEvent({
      type: 'order.created',
      storeId: 1,
      order: { id: 5 },
    });

    expect(storeOne).toHaveBeenCalledTimes(1);
    expect(storeTwo).not.toHaveBeenCalled();

    unsubOne();
    unsubTwo();
  });

  test('fans one event out to every screen watching the same store', () => {
    const hotLine = jest.fn();
    const expo = jest.fn();

    const unsubA = eventsService.subscribeToStore(1, hotLine);
    const unsubB = eventsService.subscribeToStore(1, expo);

    eventsService.publishOrderEvent({ type: 'order.created', storeId: 1 });

    expect(hotLine).toHaveBeenCalledTimes(1);
    expect(expo).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });

  test('delivers to both the store and the ordering customer', () => {
    const store = jest.fn();
    const customer = jest.fn();
    const otherCustomer = jest.fn();

    const unsubStore = eventsService.subscribeToStore(1, store);
    const unsubCustomer = eventsService.subscribeToUser(7, customer);
    const unsubOther = eventsService.subscribeToUser(8, otherCustomer);

    eventsService.publishOrderEvent({
      type: 'order.status_changed',
      storeId: 1,
      userId: 7,
    });

    expect(store).toHaveBeenCalledTimes(1);
    expect(customer).toHaveBeenCalledTimes(1);
    expect(otherCustomer).not.toHaveBeenCalled();

    unsubStore();
    unsubCustomer();
    unsubOther();
  });

  test('a guest order (no userId) publishes to the store without error', () => {
    const store = jest.fn();
    const unsub = eventsService.subscribeToStore(1, store);

    eventsService.publishOrderEvent({
      type: 'order.created',
      storeId: 1,
      userId: null,
    });

    expect(store).toHaveBeenCalledTimes(1);

    unsub();
  });

  test('unsubscribing stops delivery and leaves no listener behind', () => {
    const before = eventsService.listenerCount();
    const listener = jest.fn();

    const unsubscribe = eventsService.subscribeToStore(99, listener);
    expect(eventsService.listenerCount()).toBe(before + 1);

    unsubscribe();

    eventsService.publishOrderEvent({ type: 'order.created', storeId: 99 });

    expect(listener).not.toHaveBeenCalled();
    // The real failure this guards against: reconnecting kitchen screens
    // slowly accumulating dead subscribers over a long service.
    expect(eventsService.listenerCount()).toBe(before);
  });

  // setMaxListeners(100) only raises Node's own console-warning threshold -
  // this confirms the actual enforced cap, since nothing previously stopped
  // one account from opening unbounded concurrent SSE connections.
  test('rejects a new subscription once a channel is at its connection cap', () => {
    const storeId = 12345;
    const unsubscribers = [];

    for (let i = 0; i < 20; i += 1) {
      unsubscribers.push(eventsService.subscribeToStore(storeId, jest.fn()));
    }

    expect(() => eventsService.subscribeToStore(storeId, jest.fn())).toThrow(
      eventsService.TooManyConnectionsError
    );

    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  test('repeated subscribe/unsubscribe cycles do not leak', () => {
    const before = eventsService.listenerCount();

    for (let i = 0; i < 50; i += 1) {
      const unsubscribe = eventsService.subscribeToStore(1, jest.fn());
      unsubscribe();
    }

    expect(eventsService.listenerCount()).toBe(before);
  });
});
