const taxService = require('../../src/services/tax.service');

describe('tax.service.computeTax', () => {
  test('a zero rate leaves the amount untouched', () => {
    const result = taxService.computeTax(100, { taxRate: 0 });

    expect(result).toMatchObject({ subtotal: 100, taxAmount: 0, total: 100 });
  });

  describe('inclusive (Taiwan 內含 5%)', () => {
    test('the customer still pays the displayed price', () => {
      const result = taxService.computeTax(100, {
        taxRate: 0.05,
        taxInclusive: true,
      });

      // The whole point: 100 stays 100. Only the breakdown changes.
      expect(result.total).toBe(100);
      expect(result.subtotal).toBe(95.24);
      expect(result.taxAmount).toBe(4.76);
    });

    test('subtotal + tax always reconciles back to the total', () => {
      // Values chosen to land on awkward rounding boundaries.
      for (const amount of [0.01, 1.99, 8.9, 17.8, 33.33, 99.99, 1234.56]) {
        const result = taxService.computeTax(amount, {
          taxRate: 0.05,
          taxInclusive: true,
        });

        expect(
          Math.round((result.subtotal + result.taxAmount) * 100) / 100
        ).toBe(result.total);
      }
    });
  });

  describe('exclusive (tax added on top)', () => {
    test('tax is added to the price', () => {
      const result = taxService.computeTax(100, {
        taxRate: 0.05,
        taxInclusive: false,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(5);
      expect(result.total).toBe(105);
    });

    test('subtotal + tax always reconciles to the total', () => {
      for (const amount of [0.01, 1.99, 8.9, 17.8, 33.33, 99.99, 1234.56]) {
        const result = taxService.computeTax(amount, {
          taxRate: 0.05,
          taxInclusive: false,
        });

        expect(
          Math.round((result.subtotal + result.taxAmount) * 100) / 100
        ).toBe(result.total);
      }
    });
  });

  test('the two models differ by exactly the tax, and confusing them overcharges', () => {
    const inclusive = taxService.computeTax(100, {
      taxRate: 0.05,
      taxInclusive: true,
    });
    const exclusive = taxService.computeTax(100, {
      taxRate: 0.05,
      taxInclusive: false,
    });

    // Guards the mistake the flag exists to prevent: treating a
    // tax-inclusive menu as exclusive bills the customer 5% more.
    expect(exclusive.total).toBeGreaterThan(inclusive.total);
    expect(exclusive.total - inclusive.total).toBeCloseTo(5, 2);
  });

  test('snapshots the rate and model used', () => {
    const result = taxService.computeTax(100, {
      taxRate: 0.05,
      taxInclusive: true,
    });

    expect(result.taxRate).toBe(0.05);
    expect(result.taxInclusive).toBe(true);
  });
});
