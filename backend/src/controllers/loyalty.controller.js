const loyaltyService = require('../services/loyalty.service');

exports.getBalance = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const balance = await loyaltyService.getBalance(req.user.id, storeId);

    res.status(200).json({ storeId, balance });
  } catch (error) {
    next(error);
  }
};

exports.listAccounts = async (req, res, next) => {
  try {
    const accounts = await loyaltyService.listBalancesForUser(req.user.id);

    res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
};

exports.listTopHolders = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const holders = await loyaltyService.listTopHolders(storeId, req.query.limit);

    res.status(200).json({ holders });
  } catch (error) {
    next(error);
  }
};
