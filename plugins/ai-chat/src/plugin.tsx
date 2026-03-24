import { lazy, Suspense } from 'react';
import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
  ApiBlueprint,
  AppRootElementBlueprint,
} from '@backstage/frontend-plugin-api';

import { mcpAuthProvidersApiRef, MCPAuthProviders, AIChatDrawer } from './api';
import {
  AIChatIcon,
  aiChatApiRef,
  aiChatDrawerApiRef,
  rootRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';

const aiChatPage = PageBlueprint.make({
  disabled: true,
  params: {
    noHeader: true,
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

const aiChatDrawerApi = ApiBlueprint.make({
  name: 'drawer',
  disabled: true,
  params: defineParams =>
    defineParams({
      api: aiChatDrawerApiRef,
      deps: {},
      factory: () => new AIChatDrawer(),
    }),
});

const LazyAiChatDrawerProvider = lazy(() =>
  import('./components/AiChatDrawer').then(m => ({
    default: m.AiChatDrawerProvider,
  })),
);

const LazyAiChatFab = lazy(() =>
  import('./components/AiChatFab').then(m => ({ default: m.AiChatFab })),
);

const aiChatDrawerElement = AppRootElementBlueprint.make({
  name: 'drawer',
  disabled: true,
  params: {
    element: (
      <Suspense fallback={null}>
        <LazyAiChatDrawerProvider />
      </Suspense>
    ),
  },
});

const aiChatFabElement = AppRootElementBlueprint.make({
  name: 'fab',
  disabled: true,
  params: {
    element: (
      <Suspense fallback={null}>
        <LazyAiChatFab />
      </Suspense>
    ),
  },
});

export const aiChatPlugin = createFrontendPlugin({
  pluginId: 'ai-chat',
  extensions: [
    aiChatPage,
    aiChatNavItem,
    aiChatServiceApi,
    mcpAuthProvidersApi,
    aiChatDrawerApi,
    aiChatDrawerElement,
    aiChatFabElement,
  ],
  routes: {
    root: rootRouteRef,
  },
});
