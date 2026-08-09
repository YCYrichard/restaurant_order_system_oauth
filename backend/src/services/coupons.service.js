const couponsRepository = require('../repositories/coupons.repository');
const storesRepository = require('../repositories/stores.repository');

const VALID_DISCOUNT_TYPES = ['percent', 'fixed'];
const MAX_PER_USER_REDEMPTIONS = 1;

class CouponValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'COUPON_VALIDATION_ERROR';
  }
}

class CouponNotFoundError extends Error {
  constructor(message = 'Coupon not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function normalizeCouponInput(input) {
  const code = normalizeCode(input.code);

  if (!code) {
    throw new CouponValidationError('Coupon code is required');
  }

  if (!VALID_DISCOUNT_TYPES.includes(input.discountType)) {
    throw new CouponValidationError(
      `discountType must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}`
    );
  }

  const discountValue = Number(input.discountValue);

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new CouponValidationError('discountValue must be a positive number');
  }

  if (input.discountType === 'percent' && discountValue > 100) {
    throw new CouponValidationError(
      'A percent discount cannot exceed 100'
    );
  }

  const minOrderTotal = Number(input.minOrderTotal ?? 0);

  if (!Number.isFinite(minOrderTotal) || minOrderTotal < 0) {
    throw new CouponValidationError(
      'minOrderTotal must be zero or a positive number'
    );
  }

  let maxRedemptions = null;

  if (input.maxRedemptions !== undefined && input.maxRedemptions !== null) {
    maxRedemptions = Number(input.maxRedemptions);

    if (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0) {
      throw new CouponValidationError(
        'maxRedemptions must be a positive whole number when set'
      );
    }
  }

  return {
    code,
    storeId: input.storeId ? Number(input.storeId) : null,
    discountType: input.discountType,
    discountValue,
    minOrderTotal,
    maxRedemptions,
    startsAt: input.startsAt || null,
    expiresAt: input.expiresAt || null,
    isActive: input.isActive !== false,
  };
}

async function listCouponsForStore(storeId) {
  return couponsRepository.findCouponsForStore(storeId);
}

async function createCoupon(input) {
  const normalized = normalizeCouponInput(input);

  if (normalized.storeId !== null) {
    const store = await storesRepository.findStoreById(normalized.storeId);

    if (!store) {
      throw new CouponValidationError('Store does not exist');
    }
  }

  const existing = await couponsRepository.findCouponByCode(normalized.code);

  if (existing) {
    throw new CouponValidationError(
      `A coupon with code ${normalized.code} already exists`
    );
  }

  const couponId = await couponsRepository.insertCoupon(normalized);

  return couponsRepository.findCouponById(couponId);
}

async function setCouponActive(couponId, isActive) {
  const updated = await couponsRepository.setCouponActive(
    couponId,
    Boolean(isActive)
  );

  if (!updated) {
    throw new CouponNotFoundError();
  }

  return couponsRepository.findCouponById(couponId);
}

async function deleteCoupon(couponId) {
  const deleted = await couponsRepository.deleteCoupon(couponId);

  if (!deleted) {
    throw new CouponNotFoundError();
  }
}

// Resolves a coupon code into an actual discount. This runs server-side
// during order creation on purpose: the client sends only a code, never a
// discount amount, so the existing total-reconciliation in orders.service
// can't be bypassed by simply claiming a lower total.
async function resolveDiscount({ code, storeId, subtotal, userId }, connection) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    throw new CouponValidationError('Coupon code is required');
  }

  const coupon = await couponsRepository.findCouponByCode(
    normalizedCode,
    connection
  );

  if (!coupon) {
    throw new CouponValidationError('That coupon code is not valid');
  }

  if (!coupon.is_active) {
    throw new CouponValidationError('That coupon is no longer active');
  }

  if (coupon.store_id !== null && Number(coupon.store_id) !== Number(storeId)) {
    throw new CouponValidationError(
      'That coupon is not valid at this store'
    );
  }

  const now = Date.now();

  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    throw new CouponValidationError('That coupon is not active yet');
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) {
    throw new CouponValidationError('That coupon has expired');
  }

  if (
    coupon.max_redemptions !== null &&
    coupon.redemption_count >= coupon.max_redemptions
  ) {
    throw new CouponValidationError(
      'That coupon has reached its redemption limit'
    );
  }

  if (subtotal < Number(coupon.min_order_total)) {
    throw new CouponValidationError(
      `That coupon requires a minimum order of ${Number(
        coupon.min_order_total
      ).toFixed(2)}`
    );
  }

  // Guests have no identity to track, so per-user limits only apply to
  // signed-in customers.
  if (userId) {
    const used = await couponsRepository.countRedemptionsByUser(
      coupon.id,
      userId,
      connection
    );

    if (used >= MAX_PER_USER_REDEMPTIONS) {
      throw new CouponValidationError(
        'You have already used that coupon'
      );
    }
  }

  const rawDiscount =
    coupon.discount_type === 'percent'
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);

  // Never discount below zero - a fixed coupon larger than the order just
  // makes it free rather than producing a negative total.
  const discountAmount = roundMoney(Math.min(rawDiscount, subtotal));

  return { coupon, discountAmount };
}

module.exports = {
  CouponValidationError,
  CouponNotFoundError,
  listCouponsForStore,
  createCoupon,
  setCouponActive,
  deleteCoupon,
  resolveDiscount,
};
