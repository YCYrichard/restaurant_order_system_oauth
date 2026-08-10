jest.mock('../../src/repositories/notifications.repository');
jest.mock('../../src/repositories/users.repository');
jest.mock('../../src/services/notifications/line.provider', () => {
  const actual = jest.requireActual('../../src/services/notifications/line.provider');
  return { ...actual, send: jest.fn() };
});

const notificationsRepository = require('../../src/repositories/notifications.repository');
const usersRepository = require('../../src/repositories/users.repository');
const lineProvider = require('../../src/services/notifications/line.provider');
const notificationsService = require('../../src/services/notifications.service');

describe('notifications.service.notifyOrderReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationsRepository.logAttempt.mockResolvedValue(undefined);
  });

  it('does nothing for an order with no user (nobody to notify)', async () => {
    await notificationsService.notifyOrderReady({ id: 1, user_id: null });

    expect(notificationsRepository.logAttempt).not.toHaveBeenCalled();
    expect(usersRepository.findNotificationTarget).not.toHaveBeenCalled();
  });

  it('always logs the in-app channel as sent - it rides the existing SSE event', async () => {
    usersRepository.findNotificationTarget.mockResolvedValue({
      id: 3,
      provider: 'google',
      provider_id: 'g123',
    });

    await notificationsService.notifyOrderReady({ id: 5, user_id: 3 });

    expect(notificationsRepository.logAttempt).toHaveBeenCalledWith({
      orderId: 5,
      channel: 'inapp',
      status: 'sent',
      error: null,
    });
  });

  it('does not attempt LINE for a customer who signed in another way', async () => {
    usersRepository.findNotificationTarget.mockResolvedValue({
      id: 3,
      provider: 'google',
      provider_id: 'g123',
    });

    await notificationsService.notifyOrderReady({ id: 5, user_id: 3 });

    expect(lineProvider.send).not.toHaveBeenCalled();
    expect(notificationsRepository.logAttempt).toHaveBeenCalledTimes(1);
  });

  it('pushes via LINE for a customer who signed in with LINE', async () => {
    usersRepository.findNotificationTarget.mockResolvedValue({
      id: 3,
      provider: 'line',
      provider_id: 'Uabc123',
    });
    lineProvider.send.mockResolvedValue({ status: 'sent' });

    await notificationsService.notifyOrderReady({ id: 5, user_id: 3 });

    expect(lineProvider.send).toHaveBeenCalledWith({
      lineUserId: 'Uabc123',
      message: 'Your order #5 is ready for pickup!',
    });
    expect(notificationsRepository.logAttempt).toHaveBeenCalledWith({
      orderId: 5,
      channel: 'line',
      status: 'sent',
      error: null,
    });
  });

  it('logs not_configured rather than crashing when LINE has no channel token', async () => {
    usersRepository.findNotificationTarget.mockResolvedValue({
      id: 3,
      provider: 'line',
      provider_id: 'Uabc123',
    });
    const { NotConfiguredError } = jest.requireActual(
      '../../src/services/notifications/line.provider'
    );
    lineProvider.send.mockRejectedValue(new NotConfiguredError());

    await notificationsService.notifyOrderReady({ id: 5, user_id: 3 });

    expect(notificationsRepository.logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'line', status: 'not_configured' })
    );
    // The in-app channel must still have gone out despite LINE failing.
    expect(notificationsRepository.logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'inapp', status: 'sent' })
    );
  });

  it('logs a failed attempt when the LINE push itself errors, without throwing', async () => {
    usersRepository.findNotificationTarget.mockResolvedValue({
      id: 3,
      provider: 'line',
      provider_id: 'Uabc123',
    });
    lineProvider.send.mockRejectedValue(new Error('LINE API unreachable'));

    await expect(
      notificationsService.notifyOrderReady({ id: 5, user_id: 3 })
    ).resolves.toBeUndefined();

    expect(notificationsRepository.logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'line',
        status: 'failed',
        error: 'LINE API unreachable',
      })
    );
  });
});
