import { sendReleaseNotification } from './releaseNotifier';
import { NotificationService } from '@backstage/plugin-notifications-node';
import { LoggerService } from '@backstage/backend-plugin-api';

function createMockLogger(): jest.Mocked<LoggerService> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function createMockNotifications(): jest.Mocked<NotificationService> {
  return {
    send: jest.fn(),
  };
}

describe('sendReleaseNotification', () => {
  let logger: jest.Mocked<LoggerService>;
  let notifications: jest.Mocked<NotificationService>;

  beforeEach(() => {
    logger = createMockLogger();
    notifications = createMockNotifications();
    jest.clearAllMocks();
  });

  it('skips when version is empty', async () => {
    await sendReleaseNotification({ version: '', notifications, logger });

    expect(notifications.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not available'),
    );
  });

  it('skips when version is unparseable', async () => {
    await sendReleaseNotification({
      version: 'not-a-version',
      notifications,
      logger,
    });

    expect(notifications.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not parse'),
    );
  });

  it('skips patch releases', async () => {
    await sendReleaseNotification({
      version: '0.115.1',
      notifications,
      logger,
    });

    expect(notifications.send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('patch release'),
    );
  });

  it('sends notification for minor release with link', async () => {
    await sendReleaseNotification({
      version: '0.115.0',
      notifications,
      logger,
    });

    expect(notifications.send).toHaveBeenCalledWith({
      recipients: { type: 'broadcast' },
      payload: {
        title: 'Portal updated to v0.115.0',
        description: 'Click to view the release notes.',
        link: 'https://github.com/giantswarm/backstage/releases/tag/v0.115.0',
        severity: 'normal',
        topic: 'release',
        scope: 'release-v0.115.0',
      },
    });
  });

  it('sends notification for major release', async () => {
    await sendReleaseNotification({
      version: '1.0.0',
      notifications,
      logger,
    });

    expect(notifications.send).toHaveBeenCalledWith({
      recipients: { type: 'broadcast' },
      payload: expect.objectContaining({
        title: 'Portal updated to v1.0.0',
        link: 'https://github.com/giantswarm/backstage/releases/tag/v1.0.0',
        scope: 'release-v1.0.0',
      }),
    });
  });
});
