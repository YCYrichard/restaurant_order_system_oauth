const storesRepository = require('../repositories/stores.repository');
const storeHoursService = require('./store-hours.service');
const { isValidTaxId } = require('../utils/tax-id');

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

function normalizeInput({
  name,
  address,
  phone,
  taxRate,
  taxInclusive,
  minPrepMinutes,
  loyaltyEnabled,
  loyaltyPointsPerDollar,
  loyaltyPointValue,
  loyaltyStackableWithCoupons,
  einvoiceEnabled,
  einvoiceTaxId,
}) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    throw new StoreValidationError('Store name is required');
  }

  const normalized = {
    name: trimmedName,
    address: typeof address === 'string' ? address.trim() || null : null,
    phone: typeof phone === 'string' ? phone.trim() || null : null,
  };

  // Tax settings are optional on update - omitting them leaves the store's
  // current configuration alone rather than silently zeroing the rate.
  if (taxRate !== undefined) {
    const rate = Number(taxRate);

    if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
      throw new StoreValidationError(
        'taxRate must be a fraction between 0 and 1 (e.g. 0.05 for 5%)'
      );
    }

    normalized.taxRate = rate;
  }

  if (taxInclusive !== undefined) {
    normalized.taxInclusive = taxInclusive === true || taxInclusive === 'true';
  }

  // Also optional on update, same reasoning as tax above.
  if (minPrepMinutes !== undefined) {
    const minutes = Number(minPrepMinutes);

    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
      throw new StoreValidationError(
        'minPrepMinutes must be a whole number of minutes between 0 and 240'
      );
    }

    normalized.minPrepMinutes = minutes;
  }

  // Loyalty settings, all optional on update for the same reason as tax/
  // prep time above.
  if (loyaltyEnabled !== undefined) {
    normalized.loyaltyEnabled = loyaltyEnabled === true || loyaltyEnabled === 'true';
  }

  if (loyaltyPointsPerDollar !== undefined) {
    const rate = Number(loyaltyPointsPerDollar);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      throw new StoreValidationError(
        'loyaltyPointsPerDollar must be a number between 0 and 100'
      );
    }

    normalized.loyaltyPointsPerDollar = rate;
  }

  if (loyaltyPointValue !== undefined) {
    const value = Number(loyaltyPointValue);

    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      throw new StoreValidationError(
        'loyaltyPointValue must be a number between 0 and 1 (dollars of discount per point)'
      );
    }

    normalized.loyaltyPointValue = value;
  }

  if (loyaltyStackableWithCoupons !== undefined) {
    normalized.loyaltyStackableWithCoupons =
      loyaltyStackableWithCoupons === true || loyaltyStackableWithCoupons === 'true';
  }

  // E-invoicing, also optional on update. Businesses averaging under
  // NT$200,000 a month are legally exempt from issuing Uniform Invoices at
  // all, so this defaults off rather than being assumed-on like tax.
  if (einvoiceEnabled !== undefined) {
    normalized.einvoiceEnabled = einvoiceEnabled === true || einvoiceEnabled === 'true';
  }

  if (einvoiceTaxId !== undefined) {
    const trimmed = typeof einvoiceTaxId === 'string' ? einvoiceTaxId.trim() : '';

    if (trimmed && !isValidTaxId(trimmed)) {
      throw new StoreValidationError('einvoiceTaxId must be exactly 8 digits');
    }

    normalized.einvoiceTaxId = trimmed || null;
  }

  return normalized;
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
  const stores = await storesRepository.findPublicStores();

  // Customers need to see closed stores as closed, not discover it only
  // when checkout is rejected.
  return Promise.all(
    stores.map(async (store) => {
      const openState = await storeHoursService.getStoreOpenState(store);
      // id never reaches an unauthenticated client - public_code is the
      // only identifier a customer-facing response carries. timezone is
      // only fetched for the openState computation above, not for display.
      // eslint-disable-next-line no-unused-vars
      const { id, timezone, ...publicFields } = store;

      return {
        ...publicFields,
        is_open: openState.isOpen,
        closed_reason: openState.reason,
        today_hours: openState.todayHours ?? null,
      };
    })
  );
}

/// The single-store counterpart of listPublicStores, for a customer landing
/// on /store/:code. Unlike the list, this DOES include the numeric id - the
/// frontend needs it for every subsequent call (menu, pickup-slots, order
/// creation) once it has resolved the code. That's not a re-opening of the
/// enumeration problem: reaching this response requires already having a
/// valid code (not guessable - the whole point of public_code), and every
/// authenticated route still requires requireStoreAccess regardless of
/// whether the caller knows a numeric id. The list drops id because nothing
/// needs a code to see it; this endpoint keeps it because the resolution
/// only happens once the caller already has one.
async function getStoreByCode(code) {
  const store = await storesRepository.findStoreByCode(code);

  if (!store) {
    throw new StoreNotFoundError();
  }

  const openState = await storeHoursService.getStoreOpenState(store);
  // eslint-disable-next-line no-unused-vars
  const { timezone, ...publicFields } = store;

  return {
    ...publicFields,
    is_open: openState.isOpen,
    closed_reason: openState.reason,
    today_hours: openState.todayHours ?? null,
  };
}

/// The leaked-QR safety valve - issues a new code so the old one (printed,
/// shared, whatever) stops resolving immediately.
async function regenerateStoreCode(storeId) {
  const code = await storesRepository.regenerateStoreCode(storeId);

  if (!code) {
    throw new StoreNotFoundError();
  }

  return code;
}

async function getStoreHours(storeId) {
  const [hours, closures] = await Promise.all([
    storesRepository.findHoursForStore(storeId),
    storesRepository.findClosuresForStore(storeId),
  ]);

  return { hours, closures };
}

function normalizeHoursInput(days) {
  if (!Array.isArray(days)) {
    throw new StoreValidationError('hours must be an array of days');
  }

  return days.map((day) => {
    const dayOfWeek = Number(day.dayOfWeek);

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new StoreValidationError(
        'Each day needs a dayOfWeek between 0 (Sunday) and 6 (Saturday)'
      );
    }

    const isClosed = Boolean(day.isClosed);
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    // A closed day still needs placeholder times for the NOT NULL columns;
    // is_closed is what's actually consulted.
    const openTime = isClosed ? '00:00' : String(day.openTime ?? '');
    const closeTime = isClosed ? '00:00' : String(day.closeTime ?? '');

    if (!isClosed && (!timePattern.test(openTime) || !timePattern.test(closeTime))) {
      throw new StoreValidationError(
        'Open and close times must be in HH:MM 24-hour format'
      );
    }

    return { dayOfWeek, openTime, closeTime, isClosed };
  });
}

async function replaceStoreHours(storeId, days) {
  await storesRepository.replaceHoursForStore(
    storeId,
    normalizeHoursInput(days)
  );

  return getStoreHours(storeId);
}

async function addStoreClosure(storeId, { date, reason }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
    throw new StoreValidationError('A closure needs a date in YYYY-MM-DD form');
  }

  await storesRepository.insertClosure(storeId, { date, reason });

  return getStoreHours(storeId);
}

async function removeStoreClosure(storeId, date) {
  const removed = await storesRepository.deleteClosure(storeId, date);

  if (!removed) {
    throw new StoreNotFoundError('No closure on that date');
  }
}

async function getStore(storeId) {
  const store = await storesRepository.findStoreById(storeId);

  if (!store) {
    throw new StoreNotFoundError();
  }

  return store;
}

/// Public, unauthenticated - the checkout page needs this before a customer
/// has any reason to be signed in.
async function getPickupSlots(storeId) {
  const store = await getStore(storeId);
  return storeHoursService.getPickupSlots(store);
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
  getStoreByCode,
  regenerateStoreCode,
  getStoreHours,
  replaceStoreHours,
  addStoreClosure,
  removeStoreClosure,
  getStore,
  getPickupSlots,
  updateStore,
  updateStoreStatus,
};
