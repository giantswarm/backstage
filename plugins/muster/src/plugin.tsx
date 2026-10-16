import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import {
  ApiBlueprint,
  AppRootElementBlueprint,
  configApiRef,
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
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
  mcpServerRouteRef,
  mcpServersRouteRef,
  mcpServerToolRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerRouteRef,
  newMcpServerVerifyRouteRef,
  editMcpServerRouteRef,
  editMcpServerAuthRouteRef,
  editMcpServerVerifyRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from './routes';

/**
 * The id of the app's Customize page, which muster's tabs attach to — the way
 * upstream's `catalog-unprocessed-entities` attaches to `page:devtools`. The
 * page routes each tab's bare path to its own list screen and everything
 * deeper to the tab's router, so the routers here hold the connector,
 * tool and workflow pages and the registration wizard, never the lists.
 */
const CUSTOMIZE_PAGE = 'page:app/agent-shell-customize';

// muster contributes two of the Customize page's tabs: "Connectors"
// (`/customize/connectors`; MCP servers, renamed for people — the extension
// id and the code keep `mcp-servers`) and "Workflows"
// (`/customize/workflows`). Each carries its own root route ref, so muster's
// links resolve under the tab they belong to. They exist only where that page
// does: in the agent shell, never in classic chrome. Attached in code, not in
// `app.extensions`: deployments replace that list wholesale.
//
// Each router mounts the muster providers itself (`MusterSubPage`), pinned
// to the installation the address names, so a connector's or workflow's page
// reads its resource there whatever the section's scope.
//
// **The `usedBy` input, a cross-plugin coupling by string:** the shell's
// connector page renders the element attached to `sub-page:muster/mcp-servers`
// (input `usedBy`) as its Used by tab, and leaves the tab out when nothing is
// attached. The element reads its connector with `useConnectorPageTarget`.
// agent-platform attaches it (its `connectorUsedBy` extension); both ends carry
// this comment, and changing either without the other makes the tab vanish.
const mcpServersSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'mcp-servers',
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
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
      loader: async () => {
        const { McpServersRouter } =
          await import('./components/McpServersRouter');
        return <McpServersRouter usedBy={usedBy} />;
      },
    });
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
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
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
      loader: async () => {
        const { WorkflowsRouter } =
          await import('./components/WorkflowsRouter');
        return <WorkflowsRouter editAction={editAction} />;
      },
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
    editMcpServer: editMcpServerRouteRef,
    editMcpServerAuth: editMcpServerAuthRouteRef,
    editMcpServerVerify: editMcpServerVerifyRouteRef,
    workflows: workflowsRouteRef,
    workflowDetail: workflowDetailRouteRef,
  },
  externalRoutes: {
    customize: customizeExternalRouteRef,
  },
});
