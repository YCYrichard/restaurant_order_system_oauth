const categoriesRepository = require('../repositories/categories.repository');
const { isOwnerTier } = require('../utils/access-tier');

class CategoryValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'CATEGORY_VALIDATION_ERROR';
  }
}

class CategoryNotFoundError extends Error {
  constructor(message = 'Category not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class CategoryAccessDeniedError extends Error {
  constructor(message = 'You do not have access to this store') {
    super(message);
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}

class CategoryConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
    this.code = 'CATEGORY_CONFLICT';
  }
}

function normalizeInput({ name, sortOrder }) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    throw new CategoryValidationError('Category name is required');
  }

  const parsedSortOrder = Number.isFinite(Number(sortOrder))
    ? Number(sortOrder)
    : 0;

  return { name: trimmedName, sortOrder: parsedSortOrder };
}

// Update/delete are addressed by categoryId alone (no storeId in the
// request), so this resolves the owning store and verifies access
// explicitly - the requireStoreAccess middleware only works when storeId
// is already in req.params. Returns the caller's access tier alongside the
// category so mutation callers can require owner-tier.
async function resolveCategoryAccess(categoryId, user) {
  const category = await categoriesRepository.findCategoryById(categoryId);

  if (!category) {
    throw new CategoryNotFoundError();
  }

  let accessRole = 'admin';

  if (user.role !== 'admin') {
    accessRole = await categoriesRepository.hasStoreAccess(
      user.id,
      category.store_id
    );

    if (!accessRole) {
      throw new CategoryAccessDeniedError();
    }
  }

  return { category, accessRole };
}

async function listCategoriesByStore(storeId) {
  return categoriesRepository.findCategoriesByStore(storeId);
}

async function createCategory(storeId, input) {
  const normalized = normalizeInput(input);
  const categoryId = await categoriesRepository.insertCategory(
    storeId,
    normalized
  );

  return categoriesRepository.findCategoryById(categoryId);
}

async function updateCategory(categoryId, user, input) {
  const { accessRole } = await resolveCategoryAccess(categoryId, user);

  if (!isOwnerTier(accessRole)) {
    throw new CategoryAccessDeniedError(
      'This action requires owner or manager access to the store'
    );
  }

  const normalized = normalizeInput(input);
  await categoriesRepository.updateCategory(categoryId, normalized);

  return categoriesRepository.findCategoryById(categoryId);
}

async function deleteCategory(categoryId, user) {
  const { accessRole } = await resolveCategoryAccess(categoryId, user);

  if (!isOwnerTier(accessRole)) {
    throw new CategoryAccessDeniedError(
      'This action requires owner or manager access to the store'
    );
  }

  const productCount =
    await categoriesRepository.countProductsInCategory(categoryId);

  if (productCount > 0) {
    throw new CategoryConflictError(
      'Cannot delete a category that still has products assigned to it. Reassign or remove those products first.'
    );
  }

  const deleted = await categoriesRepository.deleteCategory(categoryId);

  if (!deleted) {
    throw new CategoryNotFoundError();
  }
}

module.exports = {
  CategoryValidationError,
  CategoryNotFoundError,
  CategoryAccessDeniedError,
  CategoryConflictError,
  listCategoriesByStore,
  createCategory,
  updateCategory,
  deleteCategory,
};
