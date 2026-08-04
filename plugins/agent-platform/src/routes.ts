import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

// The Agent Platform section (`/agent-platform`) is a tabbed page. `rootRouteRef`
// is the section itself; each top-level tab has its own route ref so
// `useRouteRef` links resolve to the right tab.
export const rootRouteRef = createRouteRef();

// The "Agents" tab (`/agent-platform/agents`). The create flow lives underneath
// it as sub-routes.
export const agentsRouteRef = createRouteRef();

export const newAgentRouteRef = createSubRouteRef({
  path: '/new',
  parent: agentsRouteRef,
});

export const newAgentSkillsRouteRef = createSubRouteRef({
  path: '/new/skills',
  parent: agentsRouteRef,
});

export const newAgentReviewRouteRef = createSubRouteRef({
  path: '/new/review',
  parent: agentsRouteRef,
});

// One agent (`/agent-platform/agents/<installation>/<namespace>/<name>`).
//
// All three segments are part of the path because all three are part of the
// agent's identity: an `Agent` name is only unique within a namespace on one
// installation. Same reasoning as `sessionDetailRouteRef` below.
//
// Three segments also keeps this clear of the create flow's `/new`,
// `/new/skills` and `/new/review`, which are one and two segments deep.
export const agentDetailRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name',
  parent: agentsRouteRef,
});

// The "Sessions" tab (`/agent-platform/sessions`).
export const sessionsRouteRef = createRouteRef();

// One session (`/agent-platform/sessions/<installation>/<id>`).
//
// The installation is part of the path rather than a query parameter because it
// is part of the session's identity: kagent session ids are only unique within an
// installation, so a link needs both to resolve. Ids are opaque — real ones mix
// 64-character hex strings and UUIDs — so nothing here constrains their shape.
export const sessionDetailRouteRef = createSubRouteRef({
  path: '/:installation/:sessionId',
  parent: sessionsRouteRef,
});

/**
 * muster's Tool Explorer, where an agent's Muster-provided tools can actually be
 * inspected and tried.
 *
 * Resolves automatically when the muster plugin is enabled (it registers this
 * target), and is unbound otherwise — in which case the agent details page names
 * the MCP server without linking anywhere.
 */
export const musterToolExplorerExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'muster.toolExplorer',
});

/**
 * The gs plugin's deployment details page.
 *
 * An agent created through this plugin is deployed as a Flux `HelmRelease`, and
 * that page already carries the release's Flux status, conditions and GitOps
 * source — so the agent page links to it rather than reproducing any of it.
 */
export const deploymentDetailsExternalRouteRef = createExternalRouteRef({
  params: ['installationName', 'kind', 'namespace', 'name'],
  defaultTarget: 'gs.deploymentDetails',
});
