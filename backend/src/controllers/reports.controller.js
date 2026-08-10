const reportsService = require('../services/reports.service');

exports.getSalesReport = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);

    const report = await reportsService.getSalesReport(storeId, {
      from: req.query.from,
      to: req.query.to,
      fulfillmentType: req.query.fulfillmentType,
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
};

exports.getItemsReport = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);

    const report = await reportsService.getItemsReport(storeId, {
      from: req.query.from,
      to: req.query.to,
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
};
