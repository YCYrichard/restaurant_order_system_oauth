const storesRepository = require('../repositories/stores.repository');

class StoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'STORE_VALIDATION_ERROR';
  }
}

class StoreNotFoundError extends Error {
  constructor(message = 'Store not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

function normalizeInput({ name, address, phone }) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    throw new StoreValidationError('Store name is required');
  }

  return {
    name: trimmedName,
    address: typeof address === 'string' ? address.trim() || null : null,
    phone: typeof phone === 'string' ? phone.trim() || null : null,
  };
}

async function createStore(input) {
  const storeId = await storesRepository.insertStore(normalizeInput(input));
  return storesRepository.findStoreById(storeId);
}

async function listStores(user) {
  if (user.role === 'admin') {
    return storesRepository.findAllStoresWithProductCount();
  }

  return storesRepository.findStoresForOwner(user.id);
}

async function listPublicStores() {
  return storesRepository.findPublicStores();
}

async function getStore(storeId) {
  const store = await storesRepository.findStoreById(storeId);

  if (!store) {
    throw new StoreNotFoundError();
  }

  return store;
}

async function updateStore(storeId, input) {
  const updated = await storesRepository.updateStore(
    storeId,
    normalizeInput(input)
  );

  if (!updated) {
    throw new StoreNotFoundError();
  }

  return storesRepository.findStoreById(storeId);
}

async function updateStoreStatus(storeId, isActive) {
  const updated = await storesRepository.updateStoreStatus(
    storeId,
    Boolean(isActive)
  );

  if (!updated) {
    throw new StoreNotFoundError();
  }

  return storesRepository.findStoreById(storeId);
}

module.exports = {
  StoreValidationError,
  StoreNotFoundError,
  createStore,
  listStores,
  listPublicStores,
  getStore,
  updateStore,
  updateStoreStatus,
};
