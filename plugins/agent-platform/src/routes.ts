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

// The Tools step (`/agent-platform/agents/new/tools`): the agent's toolset,
// composed from muster's presets and catalogue. Between Skills and Review.
export const newAgentToolsRouteRef = createSubRouteRef({
  path: '/new/tools',
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

// Editing one agent (`/agent-platform/agents/<installation>/<namespace>/<name>/edit`):
// the form pre-filled from agent-manager's reading of the agent, its dry run
// as the review, `update_agent` as the Save. Four segments, so it is clear of
// the three-segment detail path and of the create flow.
export const agentEditRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name/edit',
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

// The "Usage" tab (`/agent-platform/usage`). Last of this plugin's own tabs —
// `plugin.tsx` declares it after `modelsSubPage`, giving Agents · Sessions ·
// Models · Usage, then muster's MCP Servers. Tab order lives there, not here.
//
// Like the Models tab, this one carries a **second-level tab row**, one
// sub-route per view, and its index redirects to the first. The split is not
// cosmetic: the views differ in *whose* usage they report, and a tab makes that
// structural where a heading on a shared page only made it a caveat.
export const usageRouteRef = createRouteRef();

// "Cost" (`/agent-platform/usage/cost`): the gateway metrics broken down by
// agent and by model, plus the price-catalogue coverage that says how much the
// cost figures understate. Overview's unpriced-models warning links here.
//
// The only view with a route ref: the other three (`overview`, `conversations`,
// `mcp`) are plain routes inside `UsageRouter`, because nothing links to them
// from outside it. Add one when something does — the tab strip builds its own
// hrefs from the splat base path either way.
export const usageCostRouteRef = createSubRouteRef({
  path: '/cost',
  parent: usageRouteRef,
});

// The "Models" tab (`/agent-platform/models`): the kagent ModelConfigs agents
// run on, the serving layer beneath them, and the platform-admin flows that
// manage both. Like the muster section, the tab carries a second-level tab row
// — one sub-route per view — and its index redirects to the first view.
export const modelsRouteRef = createRouteRef();

// The "Model configs" view (`/agent-platform/models/configs`): the ModelConfigs
// list. The create and detail flows live underneath it, so the view's tab stays
// active while a model is being added or edited.
export const modelConfigsRouteRef = createSubRouteRef({
  path: '/configs',
  parent: modelsRouteRef,
});

export const newModelRouteRef = createSubRouteRef({
  path: '/configs/new',
  parent: modelsRouteRef,
});

// One model (`/agent-platform/models/configs/<installation>/<namespace>/<name>`),
// as an editable form (read-only when a tool owns the CR). Three segments for
// the same reason as `agentDetailRouteRef`: all three are part of the identity,
// and the segment count keeps it clear of `/configs/new`.
export const modelDetailRouteRef = createSubRouteRef({
  path: '/configs/:installation/:namespace/:name',
  parent: modelsRouteRef,
});

// The "Serving" view (`/agent-platform/models/serving`): the models served on
// the installations that have a serving layer, and the controls over them.
export const servingRouteRef = createSubRouteRef({
  path: '/serving',
  parent: modelsRouteRef,
});

// The "GPU capacity" view (`/agent-platform/models/capacity`): per-node GPU
// inventory on the installations that report one.
export const gpuCapacityRouteRef = createSubRouteRef({
  path: '/capacity',
  parent: modelsRouteRef,
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
