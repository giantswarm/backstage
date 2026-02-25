import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';

import { mcpAuthProvidersApiRef, MCPAuthProviders } from './api';
import {
  AIChatIcon,
  aiChatApiRef,
  rootRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';

const aiChatPage = PageBlueprint.make({
  disabled: true,
  params: {
    path: '/ai-chat',
    loader: () => import('./components/AiChat').then(m => <m.AiChatPage />),
    routeRef: rootRouteRef,
  },
});

const aiChatNavItem = NavItemBlueprint.make({
  disabled: true,
  params: {
    title: 'AI Assistant',
    icon: AIChatIcon,
    routeRef: rootRouteRef,
  },
});

const aiChatServiceApi = ApiBlueprint.make({
  name: 'service',
  disabled: true,
  params: defineParams =>
    defineParams({
      api: aiChatApiRef,
      deps: {},
      factory: () => ({}),
    }),
});

const mcpAuthProvidersApi = ApiBlueprint.make({
  name: 'mcp-auth-providers',
  params: defineParams =>
    defineParams({
      api: mcpAuthProvidersApiRef,
      deps: {},
      factory: () => new MCPAuthProviders(),
    }),
});

export const aiChatPlugin = createFrontendPlugin({
  pluginId: 'ai-chat',
  extensions: [
    aiChatPage,
    aiChatNavItem,
    aiChatServiceApi,
    mcpAuthProvidersApi,
  ],
  routes: {
    root: rootRouteRef,
  },
});
