import semver from 'semver';
import { LoggerService } from '@backstage/backend-plugin-api';
import { NotificationService } from '@backstage/plugin-notifications-node';

const RELEASE_URL_BASE = 'https://github.com/giantswarm/backstage/releases/tag';

export interface ReleaseNotifierOptions {
  version: string;
  notifications: NotificationService;
  logger: LoggerService;
}

export async function sendReleaseNotification(
  options: ReleaseNotifierOptions,
): Promise<void> {
  const { version, notifications, logger } = options;

  if (!version) {
    logger.warn('Release notifier: app version not available, skipping.');
    return;
  }

  const parsed = semver.parse(version);
  if (!parsed) {
    logger.warn(
      `Release notifier: could not parse version "${version}", skipping.`,
    );
    return;
  }

  if (parsed.patch !== 0) {
    logger.info(
      `Release notifier: patch release v${version} — skipping notification.`,
    );
    return;
  }

  const scope = `release-v${parsed.major}.${parsed.minor}.0`;

  logger.info(
    `Release notifier: sending broadcast notification for v${version}.`,
  );

  await notifications.send({
    recipients: { type: 'broadcast' },
    payload: {
      title: `Portal updated to v${version}`,
      description: 'Click to view the release notes.',
      link: `${RELEASE_URL_BASE}/v${version}`,
      severity: 'normal',
      topic: 'release',
      scope,
    },
  });
}
