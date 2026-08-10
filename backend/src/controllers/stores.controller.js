const storesService = require('../services/stores.service');

exports.createStore = async (req, res, next) => {
  try {
    const store = await storesService.createStore(req.body);

    res.status(201).json({ store });
  } catch (error) {
    next(error);
  }
};

exports.listStores = async (req, res, next) => {
  try {
    const stores = await storesService.listStores(req.user);

    res.status(200).json({ stores });
  } catch (error) {
    next(error);
  }
};

// Public listing used by the customer-facing ordering page.
// Deliberately unauthenticated and limited to the fields a customer
// needs to pick a store — no product counts, owner info, or inactive stores.
exports.listPublicStores = async (req, res, next) => {
  try {
    const stores = await storesService.listPublicStores();

    res.status(200).json({ stores });
  } catch (error) {
    next(error);
  }
};

exports.getStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const store = await storesService.getStore(storeId);

    res.status(200).json({ store });
  } catch (error) {
    next(error);
  }
};

exports.updateStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const store = await storesService.updateStore(storeId, req.body);

    res.status(200).json({ store });
  } catch (error) {
    next(error);
  }
};

exports.getStoreHours = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const result = await storesService.getStoreHours(storeId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.replaceStoreHours = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const result = await storesService.replaceStoreHours(
      storeId,
      req.body.hours
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.addStoreClosure = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const result = await storesService.addStoreClosure(storeId, req.body);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

exports.removeStoreClosure = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    await storesService.removeStoreClosure(storeId, req.params.date);

    res.status(200).json({ message: 'Closure removed' });
  } catch (error) {
    next(error);
  }
};

exports.updateStoreStatus = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const store = await storesService.updateStoreStatus(
      storeId,
      req.body.isActive
    );

    res.status(200).json({ store });
  } catch (error) {
    next(error);
  }
};
