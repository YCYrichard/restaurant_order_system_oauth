const einvoiceService = require('../../src/services/einvoice.service');

describe('einvoice.service.resolveBuyerInput', () => {
  test('returns not_applicable when the store has not enabled e-invoicing', () => {
    const result = einvoiceService.resolveBuyerInput({
      storeEinvoiceEnabled: false,
      buyerTaxId: '12345678',
      donate: true,
    });

    expect(result).toEqual({ status: 'not_applicable', buyerTaxId: null, donate: false });
  });

  test('defaults to a personal invoice when enabled and the buyer picks nothing', () => {
    const result = einvoiceService.resolveBuyerInput({
      storeEinvoiceEnabled: true,
      buyerTaxId: undefined,
      donate: undefined,
    });

    expect(result).toEqual({ status: 'pending', buyerTaxId: null, donate: false });
  });

  test('accepts a valid 8-digit buyer tax ID', () => {
    const result = einvoiceService.resolveBuyerInput({
      storeEinvoiceEnabled: true,
      buyerTaxId: '12345678',
      donate: false,
    });

    expect(result).toEqual({ status: 'pending', buyerTaxId: '12345678', donate: false });
  });

  test('trims whitespace around a buyer tax ID', () => {
    const result = einvoiceService.resolveBuyerInput({
      storeEinvoiceEnabled: true,
      buyerTaxId: '  12345678  ',
      donate: false,
    });

    expect(result.buyerTaxId).toBe('12345678');
  });

  test('rejects a tax ID that is not exactly 8 digits', () => {
    expect(() =>
      einvoiceService.resolveBuyerInput({
        storeEinvoiceEnabled: true,
        buyerTaxId: '123',
        donate: false,
      })
    ).toThrow(einvoiceService.EinvoiceValidationError);
  });

  test('rejects a tax ID and donate set together', () => {
    expect(() =>
      einvoiceService.resolveBuyerInput({
        storeEinvoiceEnabled: true,
        buyerTaxId: '12345678',
        donate: true,
      })
    ).toThrow(/not both/);
  });

  test('accepts donate on its own', () => {
    const result = einvoiceService.resolveBuyerInput({
      storeEinvoiceEnabled: true,
      buyerTaxId: '',
      donate: true,
    });

    expect(result).toEqual({ status: 'pending', buyerTaxId: null, donate: true });
  });
});

describe('einvoice.service.normalizeInvoiceNumber', () => {
  test('accepts and uppercases a valid number', () => {
    expect(einvoiceService.normalizeInvoiceNumber('ab12345678')).toBe('AB12345678');
  });

  test.each(['1234567890', 'ABC1234567', 'AB1234567', 'AB123456789', '', undefined, null])(
    'rejects a malformed number: %p',
    (value) => {
      expect(() => einvoiceService.normalizeInvoiceNumber(value)).toThrow(
        einvoiceService.EinvoiceValidationError
      );
    }
  );
});
