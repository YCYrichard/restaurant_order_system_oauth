const auditLogService = require('../services/audit-log.service');

exports.listEntries = async (req, res, next) => {
  try {
    const { storeId, action, from, to, page, pageSize } = req.query;
    const result = await auditLogService.listEntries({
      storeId,
      action,
      from,
      to,
      page,
      pageSize,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
