jest.mock('../../src/repositories/stores.repository');
jest.mock('../../src/services/store-hours.service', () => ({
  getPickupSlots: jest.fn(),
}));

const storesRepository = require('../../src/repositories/stores.repository');
const storeHoursService = require('../../src/services/store-hours.service');
const storesService = require('../../src/services/stores.service');

const store = { id: 1, name: 'Demo Store', address: null, phone: null };

describe('stores.service.updateStore minPrepMinutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.updateStore.mockResolvedValue(true);
    storesRepository.findStoreById.mockResolvedValue(store);
  });

  test('passes a valid minPrepMinutes through', async () => {
    await storesService.updateStore(1, { name: 'Demo Store', minPrepMinutes: 20 });

    expect(storesRepository.updateStore).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ minPrepMinutes: 20 })
    );
  });

  test('leaves minPrepMinutes untouched when omitted, rather than zeroing it', async () => {
    await storesService.updateStore(1, { name: 'Demo Store' });

    const passedFields = storesRepository.updateStore.mock.calls[0][1];
    expect(passedFields).not.toHaveProperty('minPrepMinutes');
  });

  test.each([-1, 241, 1.5, NaN, 'soon'])(
    'rejects an out-of-range or non-integer value: %p',
    async (value) => {
      await expect(
        storesService.updateStore(1, { name: 'Demo Store', minPrepMinutes: value })
      ).rejects.toThrow(storesService.StoreValidationError);

      expect(storesRepository.updateStore).not.toHaveBeenCalled();
    }
  );

  test('accepts the boundary values 0 and 240', async () => {
    await storesService.updateStore(1, { name: 'Demo Store', minPrepMinutes: 0 });
    await storesService.updateStore(1, { name: 'Demo Store', minPrepMinutes: 240 });

    expect(storesRepository.updateStore).toHaveBeenCalledTimes(2);
  });
});

describe('stores.service.getPickupSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws when the store does not exist', async () => {
    storesRepository.findStoreById.mockResolvedValue(null);

    await expect(storesService.getPickupSlots(99)).rejects.toThrow(
      storesService.StoreNotFoundError
    );
    expect(storeHoursService.getPickupSlots).not.toHaveBeenCalled();
  });

  test('delegates to store-hours.service with the resolved store', async () => {
    storesRepository.findStoreById.mockResolvedValue(store);
    storeHoursService.getPickupSlots.mockResolvedValue({ slots: [] });

    const result = await storesService.getPickupSlots(1);

    expect(storeHoursService.getPickupSlots).toHaveBeenCalledWith(store);
    expect(result).toEqual({ slots: [] });
  });
});
