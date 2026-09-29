import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import {
  platformCapabilitiesApiRef,
  PlatformCapabilitiesApiClient,
  platformCapabilitiesAuthApiRef,
} from './apis';
import { isInstallationEntity } from './lib/entity';

// Disabled by default: platform capabilities are Giant Swarm's own
// automation over the installations' repositories and must not appear in
// customer portals. A deployment opts in via app-config `app.extensions`
// (`api:platform-capabilities`,
// `entity-content:platform-capabilities/capabilities`), the same gating as
// the repositories plugin. The Installations page's columns follow the api.
const capabilitiesEntityContent = EntityContentBlueprint.make({
  name: 'capabilities',
  disabled: true,
  params: {
    path: '/capabilities',
    title: 'Capabilities',
    filter: isInstallationEntity,
    loader: async () => {
      const { EntityCapabilitiesContent } =
        await import('./components/EntityCapabilitiesContent');
      return <EntityCapabilitiesContent />;
    },
  },
});

// No `name`: the extension id is plain `api:platform-capabilities`.
const platformCapabilitiesApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: platformCapabilitiesApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: platformCapabilitiesAuthApiRef,
      },
      factory: ({ discoveryApi, fetchApi, authApi }) =>
        new PlatformCapabilitiesApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const platformCapabilitiesPlugin = createFrontendPlugin({
  pluginId: 'platform-capabilities',
  extensions: [capabilitiesEntityContent, platformCapabilitiesApi],
});
