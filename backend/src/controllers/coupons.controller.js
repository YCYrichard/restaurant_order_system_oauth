const couponsService = require('../services/coupons.service');

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

    res.status(200).json({ coupon });
  } catch (error) {
    next(error);
  }
};

exports.deleteCoupon = async (req, res, next) => {
  try {
    const couponId = Number(req.params.couponId);
    await couponsService.deleteCoupon(couponId);

    res.status(200).json({ message: 'Coupon deleted' });
  } catch (error) {
    next(error);
  }
};
