const auditLogRepository = require('../repositories/audit-log.repository');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parsePagination({ page, pageSize }) {
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)
  );

  return { page: parsedPage, pageSize: parsedPageSize };
}

// Never throws - a failure to WRITE the audit trail must never block the
// primary action it's describing (issuing a refund, granting access,
// etc). Logged to stderr so a systemic failure is still visible
// operationally, the same treatment notifications.service.js gives a
// failed LINE push.
async function record(entry) {
  try {
    await auditLogRepository.insertEntry(entry);
  } catch (error) {
    console.error('Failed to write audit log entry:', error, entry);
  }
}

async function listEntries({ storeId, action, from, to, page, pageSize } = {}) {
  const pagination = parsePagination({ page, pageSize });
  const offset = (pagination.page - 1) * pagination.pageSize;

  const filters = {
    storeId: storeId !== undefined && storeId !== '' ? Number(storeId) : undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const [entries, total] = await Promise.all([
    auditLogRepository.findEntries({
      ...filters,
      limit: pagination.pageSize,
      offset,
    }),
    auditLogRepository.countEntries(filters),
  ]);

  return {
    entries,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

module.exports = { record, listEntries };
