import {
  ApiBlueprint,
  configApiRef,
  featureFlagsApiRef,
} from '@backstage/frontend-plugin-api';
import { PortalFeatureFlags } from './PortalFeatureFlags';

/**
 * Overrides `api:app/feature-flags` so the `agent-platform-shell` flag follows
 * the deployment's `app.portals` config (see {@link PortalFeatureFlags}).
 */
export const agentShellFeatureFlagsApi = ApiBlueprint.make({
  name: 'feature-flags',
  params: defineParams =>
    defineParams({
      api: featureFlagsApiRef,
      deps: { configApi: configApiRef },
      factory: ({ configApi }) => new PortalFeatureFlags(configApi),
    }),
});
