const paymentsService = require('../services/payments.service');

exports.getConfig = async (_req, res, next) => {
  try {
    res.json(paymentsService.getClientConfig());
  } catch (error) {
    next(error);
  }
};

// Requires auth: an account is required to order (see orders.routes.js),
// and paying for an order requires being the customer who placed it or
// staff at that store - enforced in payments.service.assertOrderAccess.
exports.payOrder = async (req, res, next) => {
  try {
    const payment = await paymentsService.payOrder(
      Number(req.params.orderId),
      req.user,
      {
        provider: req.body.provider,
        prime: req.body.prime,
        cardholder: req.body.cardholder,
      }
    );

    res.status(201).json({ payment });
  } catch (error) {
    next(error);
  }
};
