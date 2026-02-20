import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';

import { mcpAuthProvidersApiRef, MCPAuthProviders } from './api';
import { AIChatIcon } from '@giantswarm/backstage-plugin-ai-chat-react';
import {
  rootRouteRef,
  catalogEntityExternalRouteRef,
  clusterDetailExternalRouteRef,
  deploymentDetailExternalRouteRef,
  fluxExternalRouteRef,
  techdocsEntityExternalRouteRef,
} from './routes';

const aiChatPage = PageBlueprint.make({
  params: {
    path: '/ai-chat',
    loader: () => import('./components/AiChat').then(m => <m.AiChatPage />),
    routeRef: rootRouteRef,
  },
});

const aiChatNavItem = NavItemBlueprint.make({
  params: {
    title: 'AI Assistant',
    icon: AIChatIcon,
    routeRef: rootRouteRef,
  },
});

const mcpAuthProvidersApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: mcpAuthProvidersApiRef,
      deps: {},
      factory: () => new MCPAuthProviders(),
    }),
});

export const aiChatPlugin = createFrontendPlugin({
  pluginId: 'ai-chat',
  extensions: [aiChatPage, aiChatNavItem, mcpAuthProvidersApi],
  routes: {
    root: rootRouteRef,
  },
  externalRoutes: {
    clusterDetail: clusterDetailExternalRouteRef,
    deploymentDetail: deploymentDetailExternalRouteRef,
    catalogEntity: catalogEntityExternalRouteRef,
    techdocsEntity: techdocsEntityExternalRouteRef,
    flux: fluxExternalRouteRef,
  },
});
