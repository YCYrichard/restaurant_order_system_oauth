process.env.JWT_SECRET = 'test_secret';

jest.mock('../../src/services/payments.service', () => ({
  getClientConfig: jest.fn(),
  payOrder: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const paymentsService = require('../../src/services/payments.service');

describe('GET /payments/config', () => {
  beforeEach(() => jest.clearAllMocks());

  test('is reachable without auth, since the client must know how to render checkout before login', async () => {
    paymentsService.getClientConfig.mockReturnValue({
      provider: 'manual',
      currency: 'TWD',
    });

    const res = await request(app).get('/payments/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ provider: 'manual', currency: 'TWD' });
  });
});

describe('POST /orders/:orderId/payments', () => {
  beforeEach(() => jest.clearAllMocks());

  test('charges a guest order without requiring auth', async () => {
    paymentsService.payOrder.mockResolvedValue({
      id: 1,
      provider: 'tappay',
      status: 'paid',
      amount: 20,
      currency: 'TWD',
    });

    const res = await request(app)
      .post('/orders/5/payments')
      .send({ provider: 'tappay', prime: 'prime_abc' });

    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ status: 'paid' });
    expect(paymentsService.payOrder).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ provider: 'tappay', prime: 'prime_abc' })
    );
  });

  test('surfaces a declined card with the stable error shape', async () => {
    const { PaymentProviderError } = jest.requireActual(
      '../../src/services/payments/tappay.provider'
    );

    paymentsService.payOrder.mockRejectedValue(
      new PaymentProviderError('Card is expired', { code: 'TAPPAY_10003' })
    );

    const res = await request(app)
      .post('/orders/5/payments')
      .send({ provider: 'tappay', prime: 'prime_abc' });

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'TAPPAY_10003',
      message: 'Card is expired',
    });
  });
});
