const modifiersRepository = require('../repositories/modifiers.repository');

class ModifierValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'MODIFIER_VALIDATION_ERROR';
  }
}

class ModifierNotFoundError extends Error {
  constructor(message = 'Modifier not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class ModifierAccessDeniedError extends Error {
  constructor(message = 'You do not have access to this store') {
    super(message);
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}

function normalizeGroupInput(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!name) {
    throw new ModifierValidationError('A group name is required');
  }

  const minSelect = Number(input.minSelect ?? 0);
  const maxSelect = Number(input.maxSelect ?? 1);

  if (!Number.isInteger(minSelect) || minSelect < 0) {
    throw new ModifierValidationError('minSelect must be zero or more');
  }

  if (!Number.isInteger(maxSelect) || maxSelect < 1) {
    throw new ModifierValidationError('maxSelect must be at least one');
  }

  if (minSelect > maxSelect) {
    throw new ModifierValidationError(
      'minSelect cannot be greater than maxSelect'
    );
  }

  return {
    name,
    minSelect,
    maxSelect,
    // A group requiring at least one choice is required by definition;
    // accepting both independently would let them contradict each other.
    isRequired: input.isRequired === true || minSelect > 0,
    sortOrder: Number(input.sortOrder ?? 0),
  };
}

function normalizeOptionInput(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';

  if (!name) {
    throw new ModifierValidationError('An option name is required');
  }

  const priceDelta = Number(input.priceDelta ?? 0);

  if (!Number.isFinite(priceDelta)) {
    throw new ModifierValidationError('priceDelta must be a number');
  }

  return { name, priceDelta, sortOrder: Number(input.sortOrder ?? 0) };
}

async function listGroupsForStore(storeId) {
  return modifiersRepository.findGroupsForStore(storeId);
}

async function createGroup(storeId, input) {
  const normalized = normalizeGroupInput(input);
  const groupId = await modifiersRepository.insertGroup(storeId, normalized);

  return modifiersRepository.findGroupById(groupId);
}

/// Groups are addressed by id alone, so store access is resolved here -
/// mirrors categories.service.js:resolveCategoryAccess. Returns the caller's
/// access tier alongside the group so mutation-heavy callers can require
/// owner-tier while reads stay open to any tier.
async function resolveGroupAccess(groupId, user, hasStoreAccess) {
  const group = await modifiersRepository.findGroupById(groupId);

  if (!group) {
    throw new ModifierNotFoundError();
  }

  let accessRole = 'admin';

  if (user.role !== 'admin') {
    accessRole = await hasStoreAccess(user.id, group.store_id);

    if (!accessRole) {
      throw new ModifierAccessDeniedError();
    }
  }

  return { group, accessRole };
}

// A modifier group can only be attached to/detached from a product in its
// own store - without this, an owner/staff account for store A could attach
// or detach a group on a product belonging to store B (a cross-store IDOR:
// the earlier check only verifies access to the group's store, never that
// productId is actually one of that store's products).
async function assertProductInStore(productId, storeId) {
  const belongs = await modifiersRepository.productBelongsToStore(
    productId,
    storeId
  );

  if (!belongs) {
    throw new ModifierValidationError(
      'That product does not belong to this store'
    );
  }
}

async function addOption(groupId, input) {
  const normalized = normalizeOptionInput(input);
  await modifiersRepository.insertOption(groupId, normalized);

  return modifiersRepository.findGroupById(groupId);
}

async function deleteGroup(groupId) {
  const deleted = await modifiersRepository.deleteGroup(groupId);

  if (!deleted) {
    throw new ModifierNotFoundError();
  }
}

async function deleteOption(optionId) {
  const deleted = await modifiersRepository.deleteOption(optionId);

  if (!deleted) {
    throw new ModifierNotFoundError('Option not found');
  }
}

/// Validates the options a customer picked for one line and returns the
/// snapshot rows plus the total price delta.
///
/// Every price here comes from the database. The client sends option ids
/// only - the same rule that applies to base prices and coupon discounts,
/// for the same reason.
function resolveLineModifiers(product, selectedOptionIds, groupsForProduct) {
  const groups = [...(groupsForProduct?.values() ?? [])];
  const selected = new Set(
    (selectedOptionIds ?? []).map((id) => Number(id))
  );

  const optionsById = new Map();
  for (const group of groups) {
    for (const option of group.options) {
      optionsById.set(option.id, { ...option, group });
    }
  }

  // Anything the client sent that isn't offered on this product.
  for (const optionId of selected) {
    if (!optionsById.has(optionId)) {
      throw new ModifierValidationError(
        `That option is not available for ${product.name}`
      );
    }

    if (!optionsById.get(optionId).is_active) {
      throw new ModifierValidationError(
        `${optionsById.get(optionId).name} is not currently available`
      );
    }
  }

  const resolved = [];
  let priceDelta = 0;

  for (const group of groups) {
    const chosen = group.options.filter((option) => selected.has(option.id));

    if (group.is_required && chosen.length < Math.max(1, group.min_select)) {
      throw new ModifierValidationError(
        `${product.name}: please choose an option for ${group.name}`
      );
    }

    if (chosen.length < group.min_select) {
      throw new ModifierValidationError(
        `${product.name}: ${group.name} needs at least ${group.min_select} choice(s)`
      );
    }

    if (chosen.length > group.max_select) {
      throw new ModifierValidationError(
        `${product.name}: ${group.name} allows at most ${group.max_select} choice(s)`
      );
    }

    for (const option of chosen) {
      priceDelta += Number(option.price_delta);
      resolved.push({
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        priceDelta: Number(option.price_delta),
      });
    }
  }

  return { modifiers: resolved, priceDelta };
}

module.exports = {
  ModifierValidationError,
  ModifierNotFoundError,
  ModifierAccessDeniedError,
  listGroupsForStore,
  createGroup,
  resolveGroupAccess,
  assertProductInStore,
  addOption,
  deleteGroup,
  deleteOption,
  resolveLineModifiers,
};
