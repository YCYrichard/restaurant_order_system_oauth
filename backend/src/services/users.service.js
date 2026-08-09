const bcrypt = require('bcryptjs');

const usersRepository = require('../repositories/users.repository');
const storesRepository = require('../repositories/stores.repository');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const VALID_ACCESS_ROLES = ['owner', 'manager', 'staff'];

// Roles that can sign in with a username and password. 'customer' is
// excluded on purpose - customers arrive through OAuth, not the staff
// login, and creating password-holding customer rows here would blur that.
const VALID_STAFF_ROLES = ['owner', 'staff'];
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;

class UserValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'USER_VALIDATION_ERROR';
  }
}

class UserNotFoundError extends Error {
  constructor(message = 'User not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class StoreAccessNotFoundError extends Error {
  constructor(message = 'Store access grant not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

function parsePagination({ page, pageSize }) {
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)
  );

  return { page: parsedPage, pageSize: parsedPageSize };
}

async function listUsers({ page, pageSize } = {}) {
  const pagination = parsePagination({ page, pageSize });
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [users, total] = await Promise.all([
    usersRepository.findUsers({ limit: pagination.pageSize, offset }),
    usersRepository.countUsers(),
  ]);

  return {
    users,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

/// Creates a local (username + password) staff account. Admins are
/// deliberately not creatable here - promoting someone to admin should be a
/// conscious database-level act, not a click in a panel that any admin
/// session can reach.
async function createStaffUser({ name, username, password, role }) {
  const trimmedUsername =
    typeof username === 'string' ? username.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedUsername) {
    throw new UserValidationError('A username is required');
  }

  if (!trimmedName) {
    throw new UserValidationError('A name is required');
  }

  if (!VALID_STAFF_ROLES.includes(role)) {
    throw new UserValidationError(
      `role must be one of: ${VALID_STAFF_ROLES.join(', ')}`
    );
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new UserValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }

  const existing =
    await usersRepository.findLocalUserByUsername(trimmedUsername);

  if (existing) {
    throw new UserValidationError('That username is already taken');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userId = await usersRepository.insertLocalUser({
    name: trimmedName,
    username: trimmedUsername,
    role,
    passwordHash,
  });

  return usersRepository.findUserById(userId);
}

async function requireUser(userId) {
  const user = await usersRepository.findUserById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  return user;
}

async function getStoreAccessForUser(userId) {
  await requireUser(userId);
  return usersRepository.findStoreAccessForUser(userId);
}

async function grantStoreAccess(userId, { storeId, accessRole }) {
  const parsedStoreId = Number(storeId);

  if (!Number.isInteger(parsedStoreId) || parsedStoreId <= 0) {
    throw new UserValidationError('A valid storeId is required');
  }

  if (!VALID_ACCESS_ROLES.includes(accessRole)) {
    throw new UserValidationError(
      `accessRole must be one of: ${VALID_ACCESS_ROLES.join(', ')}`
    );
  }

  await requireUser(userId);

  const store = await storesRepository.findStoreById(parsedStoreId);
  if (!store) {
    throw new UserValidationError('Store does not exist');
  }

  await usersRepository.grantStoreAccess(userId, parsedStoreId, accessRole);

  return usersRepository.findStoreAccessForUser(userId);
}

async function revokeStoreAccess(userId, storeId) {
  const revoked = await usersRepository.revokeStoreAccess(
    userId,
    Number(storeId)
  );

  if (!revoked) {
    throw new StoreAccessNotFoundError();
  }
}

module.exports = {
  UserValidationError,
  UserNotFoundError,
  StoreAccessNotFoundError,
  listUsers,
  createStaffUser,
  getStoreAccessForUser,
  grantStoreAccess,
  revokeStoreAccess,
};
