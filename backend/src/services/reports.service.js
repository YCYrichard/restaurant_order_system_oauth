const storesRepository = require('../repositories/stores.repository');
const reportsRepository = require('../repositories/reports.repository');
const storeHoursService = require('./store-hours.service');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FULFILLMENT_TYPES = ['pickup', 'delivery', 'dine_in'];

class ReportValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'REPORT_VALIDATION_ERROR';
  }
}

class StoreNotFoundError extends Error {
  constructor(message = 'Store not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function isoDateShift(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateOf(timezone, createdAt) {
  return storeHoursService.localTimeIn(timezone, new Date(createdAt)).isoDate;
}

function localHourOf(timezone, createdAt) {
  return Math.floor(
    storeHoursService.localTimeIn(timezone, new Date(createdAt)).minutes / 60
  );
}

/// Resolves the [from, to] local-calendar range an owner asked for,
/// defaulting to a trailing 7 days so the report is useful with zero
/// configuration on first load.
function parseRange({ from, to }, timezone) {
  const today = storeHoursService.localTimeIn(timezone).isoDate;
  const resolvedTo = to || today;
  const resolvedFrom = from || isoDateShift(resolvedTo, -6);

  if (!DATE_PATTERN.test(resolvedFrom) || !DATE_PATTERN.test(resolvedTo)) {
    throw new ReportValidationError(
      'from/to must be dates in YYYY-MM-DD form'
    );
  }

  if (resolvedFrom > resolvedTo) {
    throw new ReportValidationError('from must not be after to');
  }

  return { from: resolvedFrom, to: resolvedTo };
}

/// A UTC window guaranteed to contain every order whose LOCAL date falls in
/// [from, to], padded a day on each side against timezone offset. Callers
/// discard anything outside the true local range once each row's own local
/// date is known - see localDateOf.
function utcWindowFor(range) {
  return {
    fromUtc: `${isoDateShift(range.from, -1)}T00:00:00Z`,
    toUtc: `${isoDateShift(range.to, 2)}T00:00:00Z`,
  };
}

async function resolveStore(storeId) {
  const store = await storesRepository.findStoreById(storeId);

  if (!store) {
    throw new StoreNotFoundError();
  }

  return store;
}

async function getSalesReport(storeId, { from, to, fulfillmentType } = {}) {
  const store = await resolveStore(storeId);
  const timezone = store.timezone || 'Asia/Taipei';
  const range = parseRange({ from, to }, timezone);

  if (
    fulfillmentType !== undefined &&
    !FULFILLMENT_TYPES.includes(fulfillmentType)
  ) {
    throw new ReportValidationError(
      `fulfillmentType must be one of: ${FULFILLMENT_TYPES.join(', ')}`
    );
  }

  const window = utcWindowFor(range);

  const [rawOrders, rawRefunds] = await Promise.all([
    reportsRepository.findCompletedOrdersForReport(storeId, window),
    reportsRepository.findRefundsForReport(storeId, window),
  ]);

  // Trim the padded window down to orders whose LOCAL date is actually
  // inside the requested range, then apply the fulfillment-type slice.
  const orders = rawOrders
    .map((order) => ({
      ...order,
      localDate: localDateOf(timezone, order.created_at),
    }))
    .filter(
      (order) => order.localDate >= range.from && order.localDate <= range.to
    )
    .filter(
      (order) =>
        fulfillmentType === undefined ||
        order.fulfillment_type === fulfillmentType
    );

  const refunds = rawRefunds.filter((refund) => {
    const localDate = localDateOf(timezone, refund.created_at);
    return localDate >= range.from && localDate <= range.to;
  });

  const byDayMap = new Map();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orderCount: 0,
    revenue: 0,
  }));
  const byFulfillmentMap = new Map(
    FULFILLMENT_TYPES.map((type) => [type, { orderCount: 0, revenue: 0 }])
  );

  let revenue = 0;

  for (const order of orders) {
    const total = Number(order.total);
    revenue += total;

    const day = byDayMap.get(order.localDate) || {
      date: order.localDate,
      orderCount: 0,
      revenue: 0,
    };
    day.orderCount += 1;
    day.revenue = roundMoney(day.revenue + total);
    byDayMap.set(order.localDate, day);

    const hourBucket = byHour[localHourOf(timezone, order.created_at)];
    hourBucket.orderCount += 1;
    hourBucket.revenue = roundMoney(hourBucket.revenue + total);

    const fulfillmentBucket = byFulfillmentMap.get(order.fulfillment_type);
    if (fulfillmentBucket) {
      fulfillmentBucket.orderCount += 1;
      fulfillmentBucket.revenue = roundMoney(fulfillmentBucket.revenue + total);
    }
  }

  revenue = roundMoney(revenue);

  const refundAmount = roundMoney(
    refunds.reduce((sum, refund) => sum + Number(refund.amount), 0)
  );

  // Every day in the range appears even with zero orders - a quiet Tuesday
  // is data, not an absence a chart should skip over.
  const byDay = [];
  for (let cursor = range.from; cursor <= range.to; cursor = isoDateShift(cursor, 1)) {
    byDay.push(byDayMap.get(cursor) || { date: cursor, orderCount: 0, revenue: 0 });
  }

  return {
    range: { from: range.from, to: range.to, timezone },
    filters: { fulfillmentType: fulfillmentType ?? null },
    summary: {
      orderCount: orders.length,
      revenue,
      avgOrderValue: orders.length > 0 ? roundMoney(revenue / orders.length) : 0,
      refundCount: refunds.length,
      refundAmount,
      netRevenue: roundMoney(revenue - refundAmount),
    },
    byDay,
    byHour,
    byFulfillmentType: FULFILLMENT_TYPES.map((type) => ({
      fulfillmentType: type,
      ...byFulfillmentMap.get(type),
    })),
  };
}

/// Best and worst sellers among products that sold at least one unit in the
/// range. A product with zero sales simply doesn't appear here - that's a
/// different question ("what never moves") than this ranks.
async function getItemsReport(storeId, { from, to } = {}) {
  const store = await resolveStore(storeId);
  const timezone = store.timezone || 'Asia/Taipei';
  const range = parseRange({ from, to }, timezone);
  const window = utcWindowFor(range);

  const rows = await reportsRepository.findItemRowsForReport(storeId, window);

  const byProduct = new Map();

  for (const row of rows) {
    const localDate = localDateOf(timezone, row.createdAt);
    if (localDate < range.from || localDate > range.to) continue;

    const key = row.productId;
    const entry = byProduct.get(key) || {
      productId: key,
      name: row.productName || 'Deleted product',
      quantitySold: 0,
      revenue: 0,
    };

    entry.quantitySold += Number(row.quantity);
    entry.revenue = roundMoney(
      entry.revenue + Number(row.quantity) * Number(row.price)
    );
    byProduct.set(key, entry);
  }

  const items = [...byProduct.values()].sort(
    (a, b) => b.quantitySold - a.quantitySold
  );

  return {
    range: { from: range.from, to: range.to, timezone },
    items,
    bestSellers: items.slice(0, 5),
    worstSellers: items.slice(-5).reverse(),
  };
}

module.exports = {
  ReportValidationError,
  StoreNotFoundError,
  getSalesReport,
  getItemsReport,
};
