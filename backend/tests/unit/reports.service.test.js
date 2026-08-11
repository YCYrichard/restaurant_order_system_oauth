jest.mock('../../src/repositories/stores.repository');
jest.mock('../../src/repositories/reports.repository');

const storesRepository = require('../../src/repositories/stores.repository');
const reportsRepository = require('../../src/repositories/reports.repository');
const reportsService = require('../../src/services/reports.service');

const store = { id: 1, name: 'Demo Store', timezone: 'Asia/Taipei' };

describe('reports.service.getSalesReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findStoreById.mockResolvedValue(store);
    reportsRepository.findRefundsForReport.mockResolvedValue([]);
  });

  test('throws when the store does not exist', async () => {
    storesRepository.findStoreById.mockResolvedValue(null);

    await expect(
      reportsService.getSalesReport(99, { from: '2026-08-01', to: '2026-08-07' })
    ).rejects.toThrow(reportsService.StoreNotFoundError);
  });

  test('rejects a malformed date', async () => {
    await expect(
      reportsService.getSalesReport(1, { from: 'not-a-date', to: '2026-08-07' })
    ).rejects.toThrow(reportsService.ReportValidationError);
  });

  test('rejects from after to', async () => {
    await expect(
      reportsService.getSalesReport(1, { from: '2026-08-10', to: '2026-08-01' })
    ).rejects.toThrow('from must not be after to');
  });

  test('rejects a date range wider than the sane ceiling', async () => {
    await expect(
      reportsService.getSalesReport(1, { from: '2020-01-01', to: '2026-08-07' })
    ).rejects.toThrow(/cannot exceed/);
  });

  test('rejects an unknown fulfillment type', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([]);

    await expect(
      reportsService.getSalesReport(1, {
        from: '2026-08-01',
        to: '2026-08-07',
        fulfillmentType: 'teleport',
      })
    ).rejects.toThrow(/fulfillmentType must be one of/);
  });

  test('buckets an order by the STORE local date, not the UTC date', async () => {
    // 2026-08-01T23:30:00Z is already 2026-08-02 07:30 in Taipei (UTC+8) -
    // this is exactly the case the padded-window + local trim exists for.
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      {
        id: 1,
        total: '10.00',
        fulfillment_type: 'pickup',
        created_at: '2026-08-01T23:30:00Z',
      },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-02',
      to: '2026-08-02',
    });

    expect(report.summary.orderCount).toBe(1);
    expect(report.byDay).toHaveLength(1);
    expect(report.byDay[0]).toMatchObject({ date: '2026-08-02', orderCount: 1 });
  });

  test('excludes an order whose local date falls outside the requested range', async () => {
    // Same order as above, but now asking only for 2026-08-01 - the local
    // date is the 2nd, so it must not be counted.
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      {
        id: 1,
        total: '10.00',
        fulfillment_type: 'pickup',
        created_at: '2026-08-01T23:30:00Z',
      },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.summary.orderCount).toBe(0);
  });

  test('fills every day in the range even with zero orders', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-03',
    });

    expect(report.byDay.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(report.byDay.every((d) => d.orderCount === 0)).toBe(true);
  });

  test('computes revenue, average order value, and hour-of-day buckets', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      {
        id: 1,
        total: '10.00',
        fulfillment_type: 'pickup',
        // 12:00 Taipei
        created_at: '2026-08-01T04:00:00Z',
      },
      {
        id: 2,
        total: '20.00',
        fulfillment_type: 'dine_in',
        created_at: '2026-08-01T04:30:00Z',
      },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.summary).toMatchObject({
      orderCount: 2,
      revenue: 30,
      avgOrderValue: 15,
    });
    expect(report.byHour[12]).toMatchObject({ orderCount: 2, revenue: 30 });
  });

  test('slices by fulfillment type', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      { id: 1, total: '10.00', fulfillment_type: 'pickup', created_at: '2026-08-01T04:00:00Z' },
      { id: 2, total: '20.00', fulfillment_type: 'dine_in', created_at: '2026-08-01T04:00:00Z' },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
      fulfillmentType: 'dine_in',
    });

    expect(report.summary.orderCount).toBe(1);
    expect(report.summary.revenue).toBe(20);
  });

  test('rejects delivery as a filter - it is no longer an offered fulfillment type', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([]);

    await expect(
      reportsService.getSalesReport(1, {
        from: '2026-08-01',
        to: '2026-08-01',
        fulfillmentType: 'delivery',
      })
    ).rejects.toThrow(/fulfillmentType must be one of/);
  });

  test('always reports every fulfillment type bucket, even unfiltered', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      { id: 1, total: '10.00', fulfillment_type: 'pickup', created_at: '2026-08-01T04:00:00Z' },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.byFulfillmentType).toHaveLength(2);
    expect(
      report.byFulfillmentType.find((f) => f.fulfillmentType === 'pickup')
    ).toMatchObject({ orderCount: 1, revenue: 10 });
    expect(
      report.byFulfillmentType.find((f) => f.fulfillmentType === 'dine_in')
    ).toMatchObject({ orderCount: 0, revenue: 0 });
  });

  test('counts a historical delivery order in totals but not in the fulfillment-type breakdown', async () => {
    // Old orders placed before delivery was removed still exist in the
    // database - they must not vanish from revenue, only from a bucket that
    // no longer models them.
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      { id: 1, total: '30.00', fulfillment_type: 'delivery', created_at: '2026-08-01T04:00:00Z' },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.summary).toMatchObject({ orderCount: 1, revenue: 30 });
    expect(
      report.byFulfillmentType.every((f) => f.fulfillmentType !== 'delivery')
    ).toBe(true);
  });

  test('nets refunds against revenue without double-counting across days', async () => {
    reportsRepository.findCompletedOrdersForReport.mockResolvedValue([
      { id: 1, total: '50.00', fulfillment_type: 'pickup', created_at: '2026-08-01T04:00:00Z' },
    ]);
    reportsRepository.findRefundsForReport.mockResolvedValue([
      { id: 1, amount: '15.00', created_at: '2026-08-01T05:00:00Z' },
    ]);

    const report = await reportsService.getSalesReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.summary).toMatchObject({
      revenue: 50,
      refundCount: 1,
      refundAmount: 15,
      netRevenue: 35,
    });
  });
});

describe('reports.service.getItemsReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findStoreById.mockResolvedValue(store);
  });

  test('throws when the store does not exist', async () => {
    storesRepository.findStoreById.mockResolvedValue(null);

    await expect(
      reportsService.getItemsReport(99, { from: '2026-08-01', to: '2026-08-07' })
    ).rejects.toThrow(reportsService.StoreNotFoundError);
  });

  test('aggregates quantity and revenue per product across multiple lines', async () => {
    reportsRepository.findItemRowsForReport.mockResolvedValue([
      { productId: 1, productName: 'Burger', quantity: 2, price: '8.90', createdAt: '2026-08-01T04:00:00Z' },
      { productId: 1, productName: 'Burger', quantity: 1, price: '8.90', createdAt: '2026-08-01T05:00:00Z' },
      { productId: 2, productName: 'Fries', quantity: 5, price: '3.60', createdAt: '2026-08-01T04:00:00Z' },
    ]);

    const report = await reportsService.getItemsReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    const burger = report.items.find((i) => i.productId === 1);
    expect(burger).toMatchObject({ quantitySold: 3, revenue: 26.7 });

    // Fries outsold burger 5 to 3, so it ranks first.
    expect(report.bestSellers[0]).toMatchObject({ productId: 2 });
  });

  test('excludes rows whose local date falls outside the requested range', async () => {
    reportsRepository.findItemRowsForReport.mockResolvedValue([
      // Local date is 2026-08-02 in Taipei, asked-for range is the 1st only.
      { productId: 1, productName: 'Burger', quantity: 2, price: '8.90', createdAt: '2026-08-01T23:30:00Z' },
    ]);

    const report = await reportsService.getItemsReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.items).toHaveLength(0);
  });

  test('falls back to a label for a deleted product rather than showing null', async () => {
    reportsRepository.findItemRowsForReport.mockResolvedValue([
      { productId: 7, productName: null, quantity: 1, price: '5.00', createdAt: '2026-08-01T04:00:00Z' },
    ]);

    const report = await reportsService.getItemsReport(1, {
      from: '2026-08-01',
      to: '2026-08-01',
    });

    expect(report.items[0].name).toBe('Deleted product');
  });
});
