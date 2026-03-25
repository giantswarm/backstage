import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { notificationService } from '@backstage/plugin-notifications-node';
import { sendReleaseNotification } from './releaseNotifier';

export const notificationsModuleGsReleaseNotifier = createBackendModule({
  pluginId: 'notifications',
  moduleId: 'gs-release-notifier',
  register(reg) {
    reg.registerInit({
      deps: {
        notifications: notificationService,
        lifecycle: coreServices.lifecycle,
        logger: coreServices.logger,
      },
      async init({ notifications, lifecycle, logger }) {
        const version = process.env.npm_package_version ?? '';

        lifecycle.addStartupHook(async () => {
          await sendReleaseNotification({
            version,
            notifications,
            logger,
          });
        });
      },
    });
  },
});
