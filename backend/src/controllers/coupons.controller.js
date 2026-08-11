const couponsService = require('../services/coupons.service');
const auditLogService = require('../services/audit-log.service');

exports.listCouponsForStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const coupons = await couponsService.listCouponsForStore(storeId);

    res.status(200).json({ coupons });
  } catch (error) {
    next(error);
  }
};

exports.createCoupon = async (req, res, next) => {
  try {
    const coupon = await couponsService.createCoupon(req.body);

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'coupon.created',
      resourceType: 'coupon',
      resourceId: coupon.id,
      storeId: coupon.store_id,
      details: {
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ coupon });
  } catch (error) {
    next(error);
  }
};

exports.updateCouponStatus = async (req, res, next) => {
  try {
    const couponId = Number(req.params.couponId);
    const coupon = await couponsService.setCouponActive(
      couponId,
      req.body.isActive
    );

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'coupon.status_changed',
      resourceType: 'coupon',
      resourceId: couponId,
      storeId: coupon.store_id,
      details: { isActive: req.body.isActive },
      ipAddress: req.ip,
    });

    res.status(200).json({ coupon });
  } catch (error) {
    next(error);
  }
};

exports.deleteCoupon = async (req, res, next) => {
  try {
    const couponId = Number(req.params.couponId);
    await couponsService.deleteCoupon(couponId);

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'coupon.deleted',
      resourceType: 'coupon',
      resourceId: couponId,
      ipAddress: req.ip,
    });

    res.status(200).json({ message: 'Coupon deleted' });
  } catch (error) {
    next(error);
  }
};
