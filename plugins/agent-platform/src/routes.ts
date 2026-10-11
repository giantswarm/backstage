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

// Editing one agent (`/agent-platform/agents/edit/<installation>/<namespace>/<name>`,
// then `/skills`, `/tools`, `/review`): the create wizard prefilled from
// agent-manager's reading of the agent, its last step a dry run of the change
// and Save changes. A static first segment, like the skill pages'
// `/skills/edit/…`, so the wizard's steps sit under it without ever reading
// as the detail page's tabs. The former `…/<name>/edit` redirects here.
export const agentEditRouteRef = createSubRouteRef({
  path: '/edit/:installation/:namespace/:name',
  parent: agentsRouteRef,
});

// The skill pages (`/agent-platform/skills`): one discovered skill's detail
// page per `/agent-platform/skills/<owner>/<repo>[/<skill dir>]` (the trailing
// segments are a splat, since a skill directory may be nested — hrefs come from
// `skillDetailPath` in lib/skills.ts rather than route-ref params), the bare
// path redirecting to the shell's Customize → Skills tab. A page of its own
// beside `page:agent-platform`, like muster's `/agent-platform/mcp-servers`
// redirect page: the Customize screen that lists skills belongs to the app, so
// the detail page cannot hang under it.
export const skillsRouteRef = createRouteRef();

// Adding a skill (`/agent-platform/skills/new`): the form that proposes a
// skill to one of the configured repositories as a pull request. One static
// segment, so it can never be mistaken for a skill's `<owner>/<repo>` detail
// path (two or more segments).
export const newSkillRouteRef = createSubRouteRef({
  path: '/new',
  parent: skillsRouteRef,
});

// The shell's minimal "Profile and settings" page (`/agent-platform/profile`):
// who is signed in, the installations the portal talks to, and Sign out. A
// page of its own beside `page:agent-platform`, like the skill pages: it is
// linked from the shell rail's profile menu, not a tab of the section.
export const profileRouteRef = createRouteRef();

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

// The "Usage" tab (`/agent-platform/usage`), the last of the row: Sessions ·
// Agents · Models · Connectors · Workflows · Usage, as the page orders its
// tabs (`AGENT_PLATFORM_TAB_ORDER`, lib/tabOrder.ts).
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
// `technical`) are plain routes inside `UsageRouter`, because nothing links to
// them from outside it. Add one when something does — the tab strip builds its
// own hrefs from the splat base path either way.
export const usageCostRouteRef = createSubRouteRef({
  path: '/cost',
  parent: usageRouteRef,
});

// The "Models" tab (`/agent-platform/models`): the ModelConfigs list itself,
// plus the create and detail flows beneath it. The serving layer's two views
// hang off the same tab as a second-level tab row, but only where a portal has
// a serving layer to show -- so the list is the tab's own page rather than the
// first of a row, and there is no index redirect.
export const modelsRouteRef = createRouteRef();

export const newModelRouteRef = createSubRouteRef({
  path: '/new',
  parent: modelsRouteRef,
});

// One model (`/agent-platform/models/<installation>/<namespace>/<name>`), as a
// read view with Edit as an action (none when a tool owns the CR). Three
// segments for the same reason as `agentDetailRouteRef`: all three are part of
// the identity, and the segment count keeps it clear of the one-segment `/new`,
// `/serving` and `/capacity`.
export const modelDetailRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name',
  parent: modelsRouteRef,
});

// Editing one model (`/agent-platform/models/edit/<installation>/<namespace>/<name>`):
// the Connect-a-model flow prefilled from the CR, its primary Save changes. A
// static first segment like `agentEditRouteRef`, and four segments, so it is
// never read as a model's three-segment detail path.
export const modelEditRouteRef = createSubRouteRef({
  path: '/edit/:installation/:namespace/:name',
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

// The "Model cache" view (`/agent-platform/models/cache`): the cache claims
// cluster-manager lists, where a kept claim is removed.
export const modelCacheRouteRef = createSubRouteRef({
  path: '/cache',
  parent: modelsRouteRef,
});

// Model hosting's create flows, each a page of its own under the view it
// adds to (the app's one create pattern, `WizardFrame`, instead of a dialog
// over the list). Two segments, so none is ever read as a model's
// three-segment detail path. Cancel returns to the view the flow was opened
// from; the outcome lands on the view that shows it.
//
// Serve model (`…/serving/serve`): takes its seed from the query —
// `installation`, `backend`, `cluster`, `pool`, `preset` or `model` — so a
// pool's "Serve your first model" and a download's "Serve…" deep-link it.
export const serveModelRouteRef = createSubRouteRef({
  path: '/serving/serve',
  parent: modelsRouteRef,
});

// Import from Hugging Face (`…/serving/import`).
export const importModelRouteRef = createSubRouteRef({
  path: '/serving/import',
  parent: modelsRouteRef,
});

// Pull model (`…/serving/pull`).
export const pullModelRouteRef = createSubRouteRef({
  path: '/serving/pull',
  parent: modelsRouteRef,
});

// Add model backend (`…/serving/add-backend`).
export const addModelBackendRouteRef = createSubRouteRef({
  path: '/serving/add-backend',
  parent: modelsRouteRef,
});

// Add GPU node pool (`…/capacity/add-pool`).
export const addGpuNodePoolRouteRef = createSubRouteRef({
  path: '/capacity/add-pool',
  parent: modelsRouteRef,
});

/**
 * muster's Connectors tab (`/agent-platform/connectors`): the connectors table,
 * with the muster session gate and a search over server and tool names.
 *
 * Resolves automatically when the muster plugin is enabled (it registers this
 * target), and is unbound otherwise -- every call site handles `undefined`.
 */
export const musterServersExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'muster.mcpServers',
});

/**
 * A tool's page beneath the MCP server offering it
 * (`/agent-platform/connectors/<server>/tools/<tool>`), where the tool can be
 * inspected and run. `server` is the server page segment (the family name for
 * a family, `muster` for muster's own tools), `tool` the full muster name.
 */
export const musterServerToolExternalRouteRef = createExternalRouteRef({
  params: ['server', 'tool'],
  defaultTarget: 'muster.mcpServerTool',
});

/**
 * A workflow's page in muster's plugin (`/agent-platform/workflows/<name>`),
 * read with `?installation=`. Unbound when the muster plugin is disabled.
 */
export const musterWorkflowDetailExternalRouteRef = createExternalRouteRef({
  params: ['name'],
  defaultTarget: 'muster.workflowDetail',
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

/**
 * The gs plugin's Installations page, where a platform capability such as the
 * Agent Platform is enabled on an installation. The Agents tab links to it
 * when the pinned installation does not run kagent.
 */
export const installationsExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'gs.installationsPage',
});
