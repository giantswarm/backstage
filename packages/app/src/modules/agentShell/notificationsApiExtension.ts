import {
  ApiBlueprint,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import {
  NotificationsClient,
  notificationsApiRef,
} from '@backstage/plugin-notifications';

/**
 * The upstream notifications API client, for the shell's Notification inbox:
 * it reads the rows other portal features send through the standard
 * notifications service and marks them read.
 *
 * Registered here rather than by installing the upstream notifications
 * frontend plugin, whose plugin bundles the API with its own page and home
 * widget, which the portal does not ship.
 */
export const agentShellNotificationsApi = ApiBlueprint.make({
  name: 'notifications',
  params: defineParams =>
    defineParams({
      api: notificationsApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new NotificationsClient({ discoveryApi, fetchApi }),
    }),
});
