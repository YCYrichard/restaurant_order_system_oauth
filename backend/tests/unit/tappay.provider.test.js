const axios = require('axios');

jest.mock('axios');

const tappay = require('../../src/services/payments/tappay.provider');

const CREDENTIALS = {
  TAPPAY_PARTNER_KEY: 'partner_test_key',
  TAPPAY_MERCHANT_ID: 'MERCHANT_TEST',
  TAPPAY_APP_ID: '12345',
  TAPPAY_APP_KEY: 'app_test_key',
  TAPPAY_ENV: 'sandbox',
};

describe('tappay provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...CREDENTIALS };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function mockResponse(data) {
    axios.post.mockResolvedValue({ data });
  }

  describe('charge', () => {
    it('sends the server amount and partner key, never a client figure', async () => {
      mockResponse({ status: 0, rec_trade_id: 'TXN123', msg: 'Success' });

      await tappay.charge({
        prime: 'prime_abc',
        amount: 250,
        currency: 'TWD',
        orderId: 42,
        cardholder: { name: 'Ada', phone: '0912345678', email: 'a@b.c' },
      });

      const [url, body, options] = axios.post.mock.calls[0];

      expect(url).toBe('https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime');
      expect(body).toMatchObject({
        prime: 'prime_abc',
        partner_key: 'partner_test_key',
        merchant_id: 'MERCHANT_TEST',
        amount: 250,
        currency: 'TWD',
        order_number: '42',
      });
      expect(options.headers['x-api-key']).toBe('partner_test_key');
    });

    it('sends cardholder fields even when blank, since TapPay rejects their absence', async () => {
      mockResponse({ status: 0, rec_trade_id: 'TXN123' });

      await tappay.charge({
        prime: 'prime_abc',
        amount: 100,
        currency: 'TWD',
        orderId: 1,
      });

      expect(axios.post.mock.calls[0][1].cardholder).toEqual({
        phone_number: '',
        name: '',
        email: '',
      });
    });

    it('rounds TWD to a whole number and reports what was actually charged', async () => {
      mockResponse({ status: 0, rec_trade_id: 'TXN123' });

      const result = await tappay.charge({
        prime: 'prime_abc',
        amount: 8.9,
        currency: 'TWD',
        orderId: 1,
      });

      // TapPay rejects fractional TWD. The charged figure - not the order
      // total - is what the caller records, so the gap is visible in the
      // payment row rather than hidden.
      expect(axios.post.mock.calls[0][1].amount).toBe(9);
      expect(result.amount).toBe(9);
    });

    it('keeps two decimals for currencies that have them', () => {
      expect(tappay.toProviderAmount(8.5, 'USD')).toBe(8.5);
      expect(tappay.toProviderAmount(8.9, 'TWD')).toBe(9);
    });

    it('treats a non-zero status as a decline despite HTTP 200', async () => {
      // TapPay reports failures in the body, so an HTTP 200 proves nothing.
      mockResponse({ status: 10003, msg: 'Card is expired' });

      await expect(
        tappay.charge({
          prime: 'prime_abc',
          amount: 250,
          currency: 'TWD',
          orderId: 1,
        })
      ).rejects.toMatchObject({
        message: 'Card is expired',
        code: 'TAPPAY_10003',
        status: 402,
      });
    });

    it('rejects a missing prime before calling the gateway', async () => {
      await expect(
        tappay.charge({ amount: 250, currency: 'TWD', orderId: 1 })
      ).rejects.toMatchObject({ code: 'PAYMENT_TOKEN_MISSING' });

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('refuses to charge when credentials are absent', async () => {
      delete process.env.TAPPAY_PARTNER_KEY;

      await expect(
        tappay.charge({ prime: 'p', amount: 1, currency: 'TWD', orderId: 1 })
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED', status: 400 });

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('uses the production host only when explicitly asked', async () => {
      process.env.TAPPAY_ENV = 'production';
      mockResponse({ status: 0, rec_trade_id: 'TXN123' });

      await tappay.charge({
        prime: 'p',
        amount: 100,
        currency: 'TWD',
        orderId: 1,
      });

      expect(axios.post.mock.calls[0][0]).toContain('prod.tappaysdk.com');
    });
  });

  describe('refund', () => {
    it('refunds against the original transaction id', async () => {
      mockResponse({ status: 0, refund_id: 'RF1' });

      const result = await tappay.refund({
        providerTransactionId: 'TXN123',
        amount: 100,
        currency: 'TWD',
      });

      expect(axios.post.mock.calls[0][0]).toContain('/tpc/transaction/refund');
      expect(axios.post.mock.calls[0][1]).toMatchObject({
        rec_trade_id: 'TXN123',
        amount: 100,
      });
      expect(result.status).toBe('refunded');
    });

    it('will not attempt a refund without a transaction id', async () => {
      await expect(
        tappay.refund({ amount: 100, currency: 'TWD' })
      ).rejects.toMatchObject({ code: 'PAYMENT_TRANSACTION_MISSING' });

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('surfaces a gateway rejection rather than reporting success', async () => {
      mockResponse({ status: 15002, msg: 'Refund amount exceeds' });

      await expect(
        tappay.refund({
          providerTransactionId: 'TXN123',
          amount: 999,
          currency: 'TWD',
        })
      ).rejects.toMatchObject({ code: 'TAPPAY_15002' });
    });
  });
});
