import {
  coreExtensionData,
  createExtension,
  createFrontendModule,
  ExtensionBoundary,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import { agentShellOn } from './predicates';

const loadRedirect = async () => {
  const { LegacyAgentPlatformRedirect } =
    await import('./LegacyAgentPlatformRedirect');
  return <LegacyAgentPlatformRedirect />;
};

/**
 * `page:agent-platform`, the Agent Platform's old URL tree
 * (`/agent-platform/**`): only the catch-all that redirects every address
 * under it to its place in the tree that follows the rail
 * (`legacyAgentPlatformTarget`), until the end of 2026. Contributed to the
 * agent-platform plugin from here because the mapping covers both plugins'
 * old addresses and so lives in the app. Its id is the one deployed
 * `app.extensions` lists name, so it stays.
 *
 * Shell only, like every page of the Agent Platform: without the shell the
 * new addresses are not routed either, and the old ones stay not found.
 */
const legacyAgentPlatformPage = PageBlueprint.make({
  if: agentShellOn,
  params: {
    // eslint-disable-next-line giantswarm/no-restricted-syntax -- the old tree's route definition
    path: '/agent-platform',
    routeRef: agentPlatformPlugin.routes.root,
    noHeader: true,
    loader: loadRedirect,
  },
});

/**
 * `/agents` (and `/agents/*`): the short path people, briefs and old links
 * use for the agents, redirected in one hop like `/agent-platform/**`. A plain
 * route on the app's router rather than a PageBlueprint, which would wrap the
 * redirect in a page header.
 */
const legacyAgentsPage = createExtension({
  kind: 'page',
  name: 'agents-redirect',
  if: agentShellOn,
  attachTo: { id: 'app/routes', input: 'routes' },
  output: [coreExtensionData.routePath, coreExtensionData.reactElement],
  factory({ node }) {
    return [
      // eslint-disable-next-line giantswarm/no-restricted-syntax -- the old short path's route definition
      coreExtensionData.routePath('/agents'),
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, loadRedirect),
      ),
    ];
  },
});

/**
 * The Agent Platform's old addresses, as pages of the agent-platform plugin
 * (`page:agent-platform`, `page:agent-platform/agents-redirect`).
 */
export const agentPlatformLegacyPages = createFrontendModule({
  pluginId: 'agent-platform',
  extensions: [legacyAgentPlatformPage, legacyAgentsPage],
});
