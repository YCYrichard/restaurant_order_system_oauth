jest.mock('../../src/repositories/payments.repository');
jest.mock('../../src/repositories/orders.repository');
jest.mock('../../src/services/payments/tappay.provider', () => {
  const actual = jest.requireActual('../../src/services/payments/tappay.provider');

  // Only the network-facing functions are mocked - the error classes carry
  // status codes the service and error middleware rely on.
  return {
    ...actual,
    charge: jest.fn(),
    refund: jest.fn(),
  };
});

const paymentsRepository = require('../../src/repositories/payments.repository');
const ordersRepository = require('../../src/repositories/orders.repository');
const tappay = require('../../src/services/payments/tappay.provider');
const paymentsService = require('../../src/services/payments.service');

const ORDER = {
  id: 7,
  total: '250.00',
  payment_status: 'unpaid',
  customer_name: 'Ada',
  customer_phone: '0912345678',
  customer_email: 'ada@example.com',
};

const CREDENTIALS = {
  TAPPAY_PARTNER_KEY: 'partner_test_key',
  TAPPAY_MERCHANT_ID: 'MERCHANT_TEST',
  TAPPAY_APP_ID: '12345',
  TAPPAY_APP_KEY: 'app_test_key',
};

describe('payments service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PAYMENT_PROVIDER;
    Object.keys(CREDENTIALS).forEach((key) => delete process.env[key]);

    ordersRepository.findOrderById.mockResolvedValue({ ...ORDER });
    paymentsRepository.sumPaidForOrder.mockResolvedValue(0);
    paymentsRepository.insertPayment.mockResolvedValue(1);
    paymentsRepository.updateOrderPaymentStatus.mockResolvedValue();
    paymentsRepository.updatePaymentStatus.mockResolvedValue();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getClientConfig', () => {
    it('reports manual mode when no gateway is configured', () => {
      expect(paymentsService.getClientConfig()).toMatchObject({
        provider: 'manual',
      });
    });

    it('exposes the client key pair but never the partner key', () => {
      process.env = { ...process.env, ...CREDENTIALS, PAYMENT_PROVIDER: 'tappay' };

      const config = paymentsService.getClientConfig();

      expect(config).toMatchObject({
        provider: 'tappay',
        appId: 12345,
        appKey: 'app_test_key',
        env: 'sandbox',
      });
      expect(JSON.stringify(config)).not.toContain('partner_test_key');
    });

    it('falls back to manual when tappay is requested with incomplete keys', () => {
      process.env.PAYMENT_PROVIDER = 'tappay';
      process.env.TAPPAY_APP_ID = '12345';

      // A half-configured gateway must not present a card form that can
      // never succeed.
      expect(paymentsService.getClientConfig().provider).toBe('manual');
    });
  });

  describe('payOrder', () => {
    it('charges the stored order total, ignoring anything the client sends', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      tappay.charge.mockResolvedValue({
        status: 'paid',
        providerTransactionId: 'TXN1',
        method: 'card',
        amount: 250,
        raw: { status: 0 },
      });

      await paymentsService.payOrder(7, {
        provider: 'tappay',
        prime: 'prime_abc',
        // A client-supplied amount has no route into the charge at all.
        amount: 1,
      });

      expect(tappay.charge).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 250, prime: 'prime_abc' })
      );
    });

    it('marks the order paid and records the gateway transaction', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      tappay.charge.mockResolvedValue({
        status: 'paid',
        providerTransactionId: 'TXN1',
        method: 'card',
        amount: 250,
        raw: { status: 0 },
      });

      const result = await paymentsService.payOrder(7, {
        provider: 'tappay',
        prime: 'prime_abc',
      });

      expect(paymentsRepository.insertPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 7,
          provider: 'tappay',
          providerTransactionId: 'TXN1',
          amount: 250,
          status: 'paid',
        })
      );
      expect(paymentsRepository.updateOrderPaymentStatus).toHaveBeenCalledWith(
        7,
        'paid'
      );
      expect(result.status).toBe('paid');
    });

    it('records the amount the gateway actually charged, not the order total', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      ordersRepository.findOrderById.mockResolvedValue({
        ...ORDER,
        total: '8.90',
      });
      tappay.charge.mockResolvedValue({
        status: 'paid',
        providerTransactionId: 'TXN1',
        amount: 9, // TWD rounding inside the provider
        raw: { status: 0 },
      });

      await paymentsService.payOrder(7, {
        provider: 'tappay',
        prime: 'prime_abc',
      });

      expect(paymentsRepository.insertPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 9 })
      );
    });

    it('records a declined card as a failed attempt and rethrows', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      const declined = new tappay.PaymentProviderError('Card is expired', {
        code: 'TAPPAY_10003',
        raw: { status: 10003 },
      });
      tappay.charge.mockRejectedValue(declined);

      await expect(
        paymentsService.payOrder(7, { provider: 'tappay', prime: 'p' })
      ).rejects.toThrow('Card is expired');

      // The failed attempt is part of the order's history - it is what makes
      // "your system says it charged me" answerable.
      expect(paymentsRepository.insertPayment).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', providerTransactionId: null })
      );
      expect(paymentsRepository.updateOrderPaymentStatus).toHaveBeenCalledWith(
        7,
        'failed'
      );
    });

    it('leaves a manual order unpaid until it is collected', async () => {
      const result = await paymentsService.payOrder(7, { provider: 'manual' });

      expect(result).toMatchObject({ provider: 'manual', status: 'pending' });
      expect(paymentsRepository.updateOrderPaymentStatus).toHaveBeenCalledWith(
        7,
        'unpaid'
      );
    });

    it('refuses to charge an already-paid order twice', async () => {
      ordersRepository.findOrderById.mockResolvedValue({
        ...ORDER,
        payment_status: 'paid',
      });

      await expect(paymentsService.payOrder(7, {})).rejects.toThrow(
        'already been paid'
      );
      expect(paymentsRepository.insertPayment).not.toHaveBeenCalled();
    });

    it('refuses to charge an order with nothing outstanding', async () => {
      paymentsRepository.sumPaidForOrder.mockResolvedValue(250);

      await expect(paymentsService.payOrder(7, {})).rejects.toThrow(
        'nothing left to pay'
      );
    });

    it('rejects a card payment when the gateway is not configured', async () => {
      await expect(
        paymentsService.payOrder(7, { provider: 'tappay', prime: 'p' })
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' });
    });

    it('rejects an unknown provider', async () => {
      await expect(
        paymentsService.payOrder(7, { provider: 'bitcoin' })
      ).rejects.toThrow("Unknown payment provider 'bitcoin'");
    });
  });

  describe('refundPayment', () => {
    it('returns null when there is no gateway charge to reverse', async () => {
      paymentsRepository.findLatestPaidPayment.mockResolvedValue(null);

      // Cash orders still get a refund RECORD; this only means no gateway
      // call was needed.
      await expect(paymentsService.refundPayment(7, 50)).resolves.toBeNull();
    });

    it('does not call a gateway for a manually-collected payment', async () => {
      paymentsRepository.findLatestPaidPayment.mockResolvedValue({
        id: 1,
        provider: 'manual',
        amount: '250.00',
      });

      await expect(paymentsService.refundPayment(7, 50)).resolves.toBeNull();
      expect(tappay.refund).not.toHaveBeenCalled();
    });

    it('reverses the original transaction and marks a full refund', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      paymentsRepository.findLatestPaidPayment.mockResolvedValue({
        id: 3,
        provider: 'tappay',
        provider_transaction_id: 'TXN1',
        amount: '250.00',
        currency: 'TWD',
      });
      tappay.refund.mockResolvedValue({
        status: 'refunded',
        providerTransactionId: 'TXN1',
        raw: { status: 0 },
      });

      await paymentsService.refundPayment(7, 250);

      expect(tappay.refund).toHaveBeenCalledWith(
        expect.objectContaining({ providerTransactionId: 'TXN1', amount: 250 })
      );
      expect(paymentsRepository.updatePaymentStatus).toHaveBeenCalledWith(
        3,
        'refunded'
      );
      expect(paymentsRepository.updateOrderPaymentStatus).toHaveBeenCalledWith(
        7,
        'refunded'
      );
    });

    it('leaves a partly-refunded charge live', async () => {
      process.env = { ...process.env, ...CREDENTIALS };
      paymentsRepository.findLatestPaidPayment.mockResolvedValue({
        id: 3,
        provider: 'tappay',
        provider_transaction_id: 'TXN1',
        amount: '250.00',
        currency: 'TWD',
      });
      tappay.refund.mockResolvedValue({ status: 'refunded', raw: {} });

      await paymentsService.refundPayment(7, 50);

      // 50 of 250 back does not make the charge refunded.
      expect(paymentsRepository.updatePaymentStatus).not.toHaveBeenCalled();
      expect(paymentsRepository.updateOrderPaymentStatus).not.toHaveBeenCalled();
    });
  });
});
