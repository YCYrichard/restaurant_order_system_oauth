jest.mock('../../src/config/db', () => ({
  execute: jest.fn(),
}));

const db = require('../../src/config/db');
const storesRepository = require('../../src/repositories/stores.repository');

describe('stores.repository.insertStore', () => {
  beforeEach(() => jest.clearAllMocks());

  test('inserts with a generated public_code', async () => {
    db.execute.mockResolvedValue([{ insertId: 5 }]);

    const id = await storesRepository.insertStore({
      name: 'New Store',
      address: null,
      phone: null,
    });

    expect(id).toBe(5);
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO stores/);
    // public_code is the first bound param (column list: public_code, name, ...)
    expect(typeof params[0]).toBe('string');
    expect(params[0].length).toBeGreaterThan(0);
  });

  test('retries on a duplicate code rather than failing the whole insert', async () => {
    const duplicateError = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';

    db.execute
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce([{ insertId: 9 }]);

    const id = await storesRepository.insertStore({
      name: 'New Store',
      address: null,
      phone: null,
    });

    expect(id).toBe(9);
    expect(db.execute).toHaveBeenCalledTimes(2);
    // The retried attempt must use a different code than the failed one.
    const firstCode = db.execute.mock.calls[0][1][0];
    const secondCode = db.execute.mock.calls[1][1][0];
    expect(secondCode).not.toBe(firstCode);
  });

  test('gives up after 5 collisions rather than retrying forever', async () => {
    const duplicateError = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';
    db.execute.mockRejectedValue(duplicateError);

    await expect(
      storesRepository.insertStore({ name: 'New Store', address: null, phone: null })
    ).rejects.toThrow(/unique store code/);

    expect(db.execute).toHaveBeenCalledTimes(5);
  });

  test('propagates a non-duplicate error immediately, without retrying', async () => {
    db.execute.mockRejectedValue(new Error('connection lost'));

    await expect(
      storesRepository.insertStore({ name: 'New Store', address: null, phone: null })
    ).rejects.toThrow('connection lost');

    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('stores.repository.regenerateStoreCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the new code when a row was actually updated', async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);

    const code = await storesRepository.regenerateStoreCode(1);

    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  test('returns null when the store does not exist (no row updated)', async () => {
    db.execute.mockResolvedValue([{ affectedRows: 0 }]);

    await expect(storesRepository.regenerateStoreCode(999)).resolves.toBeNull();
  });

  test('retries on a duplicate code collision', async () => {
    const duplicateError = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';

    db.execute
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const code = await storesRepository.regenerateStoreCode(1);

    expect(typeof code).toBe('string');
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});
