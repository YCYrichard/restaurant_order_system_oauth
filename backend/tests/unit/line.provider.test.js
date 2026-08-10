const axios = require('axios');

jest.mock('axios');

const lineProvider = require('../../src/services/notifications/line.provider');

describe('line notification provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.LINE_MESSAGING_CHANNEL_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('refuses to send without a channel token configured', async () => {
    await expect(
      lineProvider.send({ lineUserId: 'U123', message: 'hi' })
    ).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_CONFIGURED' });

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses to send without a recipient id', async () => {
    process.env.LINE_MESSAGING_CHANNEL_TOKEN = 'channel_token';

    await expect(
      lineProvider.send({ message: 'hi' })
    ).rejects.toThrow('No LINE user id to push to');

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('pushes a text message to the given LINE user id', async () => {
    process.env.LINE_MESSAGING_CHANNEL_TOKEN = 'channel_token';
    axios.post.mockResolvedValue({ data: {} });

    const result = await lineProvider.send({
      lineUserId: 'U123',
      message: 'Your order #5 is ready for pickup!',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/push',
      {
        to: 'U123',
        messages: [
          { type: 'text', text: 'Your order #5 is ready for pickup!' },
        ],
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer channel_token',
        }),
      })
    );
    expect(result).toEqual({ status: 'sent' });
  });

  it('propagates a gateway error rather than reporting success', async () => {
    process.env.LINE_MESSAGING_CHANNEL_TOKEN = 'channel_token';
    axios.post.mockRejectedValue(new Error('LINE API unreachable'));

    await expect(
      lineProvider.send({ lineUserId: 'U123', message: 'hi' })
    ).rejects.toThrow('LINE API unreachable');
  });
});
