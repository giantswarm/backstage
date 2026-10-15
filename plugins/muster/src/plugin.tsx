import { lazy, Suspense } from 'react';
import type { ComponentType, ReactElement } from 'react';
import {
  ApiBlueprint,
  AppRootElementBlueprint,
  configApiRef,
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { AGENT_SHELL_ON } from '@giantswarm/backstage-plugin-agent-platform-common';

import {
  musterApiRef,
  MusterApiClient,
  MusterAuthProviders,
  musterAuthProvidersApiRef,
} from './apis';
import { mcpUsageSection } from './mcpUsageSection';
import {
  customizeExternalRouteRef,
  legacyMcpServersRouteRef,
  mcpServerRouteRef,
  mcpServersRouteRef,
  mcpServerToolRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
  newMcpServerVerifyRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from './routes';

/**
 * The loader of one muster tab: its router inside the shared muster providers
 * and the inventory-failure gate (`MusterSubPage`).
 */
function musterTab<P extends object>(
  context: string,
  loadRouter: () => Promise<ComponentType<P>>,
  props?: P,
) {
  return async () => {
    const [{ MusterSubPage }, Router] = await Promise.all([
      import('./components/MusterSubPage'),
      loadRouter(),
    ]);
    return (
      <MusterSubPage context={context}>
        <Router {...(props as P)} />
      </MusterSubPage>
    );
  };
}

// muster contributes two of the Agent Platform page's sections:
// "Connectors" (`/agent-platform/connectors`; MCP servers, renamed for people
// — the extension id and the code keep `mcp-servers`) and "Workflows"
// (`/agent-platform/workflows`). Each carries its own root route ref, so
// muster's links resolve under the tab they belong to. Their place among the
// Agent Platform's tabs is the page's own (agent-platform's
// `AGENT_PLATFORM_TAB_ORDER`), keyed by these extensions' ids. They exist only
// where that page does: in the agent shell (agent-platform's
// `AGENT_SHELL_ON`), never in classic chrome.
//
// **The `usedBy` input, a cross-plugin coupling by string:** the shell's
// connector page renders the element attached to `sub-page:muster/mcp-servers`
// (input `usedBy`) as its Used by tab, and leaves the tab out when nothing is
// attached. The element reads its connector with `useConnectorPageTarget`.
// agent-platform attaches it (its `connectorUsedBy` extension); both ends carry
// this comment, and changing either without the other makes the tab vanish.
const mcpServersSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'mcp-servers',
  attachTo: { id: 'page:agent-platform', input: 'pages' },
  inputs: {
    usedBy: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
      optional: true,
    }),
  },
  factory(originalFactory, { inputs }) {
    const usedBy: ReactElement | undefined = inputs.usedBy?.get(
      coreExtensionData.reactElement,
    );
    return originalFactory({
      path: 'connectors',
      title: 'Connectors',
      routeRef: mcpServersRouteRef,
      loader: musterTab(
        'The connectors of an environment are read through its Kubernetes API.',
        () =>
          import('./components/McpServersRouter').then(m => m.McpServersRouter),
        { usedBy },
      ),
    });
  },
});

// The tab's old address stays as a nav-less redirect, so every shared link
// resolves: `/agent-platform/mcp-servers…` → `/agent-platform/connectors…`.
// Enabled by default on purpose: deployments replace `app.extensions`
// wholesale (the chart does), so an opt-in entry would silently drop the
// redirect there. Shell only, like the Agent Platform page it redirects into:
// without the shell nothing of the Agent Platform is routed, the old address
// included.
const mcpServersRedirectPage = PageBlueprint.make({
  name: 'mcp-servers-redirect',
  if: AGENT_SHELL_ON,
  params: {
    // eslint-disable-next-line giantswarm/no-restricted-syntax -- the old address's route definition
    path: '/agent-platform/mcp-servers',
    routeRef: legacyMcpServersRouteRef,
    noHeader: true,
    loader: async () => {
      const { ConnectorsRedirect } =
        await import('./components/ConnectorsRedirect');
      return <ConnectorsRedirect />;
    },
  },
});

// **The `editAction` input, a cross-plugin coupling by string:** the shell's
// workflow page renders the element attached to `sub-page:muster/workflows`
// (input `editAction`) beside its title, and nothing when nothing is
// attached. The element reads its workflow with `useWorkflowPageTarget`.
// agent-platform attaches it (its `workflowEditAssist` extension: the hand-off
// to the workflow agent); both ends carry this comment, and changing either
// without the other makes the action vanish.
const workflowsSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'workflows',
  attachTo: { id: 'page:agent-platform', input: 'pages' },
  inputs: {
    editAction: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
      optional: true,
    }),
  },
  factory(originalFactory, { inputs }) {
    const editAction: ReactElement | undefined = inputs.editAction?.get(
      coreExtensionData.reactElement,
    );
    return originalFactory({
      path: 'workflows',
      title: 'Workflows',
      routeRef: workflowsRouteRef,
      loader: musterTab(
        'The workflows of an environment are read through its Kubernetes API.',
        () =>
          import('./components/WorkflowsRouter').then(m => m.WorkflowsRouter),
        { editAction },
      ),
    });
  },
});

// The kubernetes APIs are dependencies because a muster other than the home
// installation's is reached with that installation's brokered Dex token, minted
// through them (kubernetesApi.getCluster → kubernetesAuthProvidersApi
// .getCredentials) exactly like the kagent and model-manager clients do. The
// home installation keeps the `authProvidersApi` (main-login) token.
const musterApi = ApiBlueprint.make({
  name: 'muster',
  params: defineParams =>
    defineParams({
      api: musterApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        configApi: configApiRef,
        authProvidersApi: musterAuthProvidersApiRef,
        kubernetesApi: kubernetesApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: deps => new MusterApiClient(deps),
    }),
});

// Default knows no providers; the app overrides this with the gs auth
// providers (see packages/app/src/modules/muster).
const musterAuthProvidersApi = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: musterAuthProvidersApiRef,
      deps: {},
      factory: () => new MusterAuthProviders(),
    }),
});

const LazyMcpAuthNotice = lazy(() =>
  import('./components/McpAuthNotice').then(m => ({
    default: m.McpAuthNotice,
  })),
);

// The notice, on every page, that MCP servers wait for the person's sign-in
// or grant, with the dialog that signs in to them. Shell only, like every
// other surface of muster: without the Agent Platform nothing would use the
// servers it names.
const mcpAuthNoticeElement = AppRootElementBlueprint.make({
  name: 'mcp-auth-notice',
  if: AGENT_SHELL_ON,
  params: {
    element: (
      <Suspense fallback={null}>
        <LazyMcpAuthNotice />
      </Suspense>
    ),
  },
});

export const musterPlugin = createFrontendPlugin({
  pluginId: 'muster',
  extensions: [
    mcpServersSubPage,
    mcpServersRedirectPage,
    workflowsSubPage,
    mcpUsageSection,
    musterApi,
    musterAuthProvidersApi,
    mcpAuthNoticeElement,
  ],
  routes: {
    mcpServers: mcpServersRouteRef,
    mcpServer: mcpServerRouteRef,
    mcpServerTool: mcpServerToolRouteRef,
    newMcpServer: newMcpServerRouteRef,
    newMcpServerAuth: newMcpServerAuthRouteRef,
    newMcpServerVerify: newMcpServerVerifyRouteRef,
    workflows: workflowsRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
  externalRoutes: {
    customize: customizeExternalRouteRef,
  },
});
