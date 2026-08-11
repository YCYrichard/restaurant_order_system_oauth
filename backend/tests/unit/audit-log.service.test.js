jest.mock('../../src/repositories/audit-log.repository');

const auditLogRepository = require('../../src/repositories/audit-log.repository');
const auditLogService = require('../../src/services/audit-log.service');

describe('audit-log.service.record', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes an entry via the repository', async () => {
    auditLogRepository.insertEntry.mockResolvedValue(undefined);

    await auditLogService.record({
      actorUserId: 1,
      actorRole: 'admin',
      action: 'order.refunded',
      resourceType: 'order',
      resourceId: 5,
    });

    expect(auditLogRepository.insertEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'order.refunded', resourceId: 5 })
    );
  });

  // The core contract: a broken audit trail must never take down the
  // primary action it's describing (a refund, a role grant, a login).
  test('swallows a repository failure instead of throwing', async () => {
    auditLogRepository.insertEntry.mockRejectedValue(new Error('DB is down'));

    await expect(
      auditLogService.record({
        actorUserId: 1,
        actorRole: 'admin',
        action: 'order.refunded',
        resourceType: 'order',
      })
    ).resolves.toBeUndefined();
  });
});

describe('audit-log.service.listEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auditLogRepository.findEntries.mockResolvedValue([]);
    auditLogRepository.countEntries.mockResolvedValue(0);
  });

  test('defaults to page 1 and the default page size', async () => {
    await auditLogService.listEntries({});

    expect(auditLogRepository.findEntries).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
  });

  test('clamps an oversized pageSize to the maximum', async () => {
    await auditLogService.listEntries({ pageSize: 99999 });

    expect(auditLogRepository.findEntries).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 })
    );
  });

  test('computes the correct offset for a later page', async () => {
    await auditLogService.listEntries({ page: 3, pageSize: 20 });

    expect(auditLogRepository.findEntries).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 40 })
    );
  });

  test('passes storeId/action filters through as a number/string', async () => {
    await auditLogService.listEntries({ storeId: '7', action: 'order.refunded' });

    expect(auditLogRepository.findEntries).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 7, action: 'order.refunded' })
    );
    expect(auditLogRepository.countEntries).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 7, action: 'order.refunded' })
    );
  });
});
