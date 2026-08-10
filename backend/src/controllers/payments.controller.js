const paymentsService = require('../services/payments.service');

exports.getConfig = async (_req, res, next) => {
  try {
    res.json(paymentsService.getClientConfig());
  } catch (error) {
    next(error);
  }
};

// Unauthenticated, matching guest checkout: an order can be placed without
// an account, so requiring one to pay for it would strand every guest. The
// request carries no amount and returns no order detail, so knowing an order
// id buys an attacker nothing beyond the ability to pay someone's bill with
// their own card.
exports.payOrder = async (req, res, next) => {
  try {
    const payment = await paymentsService.payOrder(Number(req.params.orderId), {
      provider: req.body.provider,
      prime: req.body.prime,
      cardholder: req.body.cardholder,
    });

    res.status(201).json({ payment });
  } catch (error) {
    next(error);
  }
};
