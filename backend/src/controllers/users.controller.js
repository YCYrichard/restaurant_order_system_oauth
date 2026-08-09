const usersService = require('../services/users.service');

exports.listUsers = async (req, res, next) => {
  try {
    const result = await usersService.listUsers(req.query);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.createStaffUser = async (req, res, next) => {
  try {
    const user = await usersService.createStaffUser(req.body);

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
};

exports.getStoreAccessForUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const storeAccess = await usersService.getStoreAccessForUser(userId);

    res.status(200).json({ storeAccess });
  } catch (error) {
    next(error);
  }
};

exports.grantStoreAccess = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const storeAccess = await usersService.grantStoreAccess(userId, req.body);

    res.status(201).json({ storeAccess });
  } catch (error) {
    next(error);
  }
};

exports.revokeStoreAccess = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const storeId = Number(req.params.storeId);

    await usersService.revokeStoreAccess(userId, storeId);

    res.status(200).json({ message: 'Store access revoked' });
  } catch (error) {
    next(error);
  }
};
