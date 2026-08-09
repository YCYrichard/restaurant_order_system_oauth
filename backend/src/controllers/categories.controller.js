const categoriesService = require('../services/categories.service');

exports.listCategoriesByStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const categories = await categoriesService.listCategoriesByStore(storeId);

    res.status(200).json({ categories });
  } catch (error) {
    next(error);
  }
};

// Public listing used by the customer-facing menu, so it can group
// products by real category instead of a hardcoded string.
exports.listPublicCategoriesByStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const categories = await categoriesService.listCategoriesByStore(storeId);

    res.status(200).json({ categories });
  } catch (error) {
    next(error);
  }
};

exports.createCategory = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const category = await categoriesService.createCategory(
      storeId,
      req.body
    );

    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const category = await categoriesService.updateCategory(
      categoryId,
      req.user,
      req.body
    );

    res.status(200).json({ category });
  } catch (error) {
    next(error);
  }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const categoryId = Number(req.params.categoryId);
    await categoriesService.deleteCategory(categoryId, req.user);

    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
};
