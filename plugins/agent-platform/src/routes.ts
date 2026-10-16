import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

// The Agent Platform's old URL tree (`/agent-platform`), which only
// redirects now: every address under it goes, in one hop, to its place in
// the tree that follows the shell's rail (giantswarm/giantswarm#38510). The
// app mounts that catch-all (its `legacyAgentPlatformTarget`) on this route.
export const rootRouteRef = createRouteRef();

// The Customize screen's Agents tab (`/customize/agents`): a sub-page of the
// app's Customize page, whose bare path is the list; the create flow, an
// agent's page and its edit live underneath it as sub-routes.
export const agentsRouteRef = createRouteRef();

// The create wizard: `new`, then `new/skills`, `new/tools`, `new/review`.
// `new` is a reserved word here: no installation can be named so.
export const newAgentRouteRef = createSubRouteRef({
  path: '/new',
  parent: agentsRouteRef,
});

export const newAgentSkillsRouteRef = createSubRouteRef({
  path: '/new/skills',
  parent: agentsRouteRef,
});

// The Tools step: the agent's toolset, composed from muster's presets and
// catalogue. Between Skills and Review.
export const newAgentToolsRouteRef = createSubRouteRef({
  path: '/new/tools',
  parent: agentsRouteRef,
});

export const newAgentReviewRouteRef = createSubRouteRef({
  path: '/new/review',
  parent: agentsRouteRef,
});

// One agent (`<installation>/<namespace>/<name>`), its tabs below it.
//
// All three segments are part of the path because all three are part of the
// agent's identity: an `Agent` name is only unique within a namespace on one
// installation. Same reasoning as `sessionDetailRouteRef` below.
export const agentDetailRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name',
  parent: agentsRouteRef,
});

// Editing one agent (`<installation>/<namespace>/<name>/edit`, then `/skills`,
// `/tools`, `/review`): the create wizard prefilled from agent-manager's
// reading of the agent, its last step a dry run of the change and Save
// changes. The one edit shape agents, models and connectors share; `edit`
// is no tab of the agent's page.
export const agentEditRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name/edit',
  parent: agentsRouteRef,
});

// The Customize screen's Skills tab (`/customize/skills`): one discovered
// skill's page per `<owner>/<repo>[/<skill dir>]` (the trailing segments are
// a splat, since a skill directory may be nested — hrefs come from
// `useSkillPaths`, built on `skillDetailPath` in lib/skills.ts, rather than
// route-ref params), the bare path the list.
export const skillsRouteRef = createRouteRef();

// Adding a skill (`/customize/skills/new`): the form that proposes a skill to
// one of the configured repositories as a pull request. One static segment,
// so it can never be mistaken for a skill's `<owner>/<repo>` detail path (two
// or more segments).
export const newSkillRouteRef = createSubRouteRef({
  path: '/new',
  parent: skillsRouteRef,
});

// The shell's minimal "Profile and settings" page (`/profile`): who is signed
// in, the installations the portal talks to, and Sign out. Linked from the
// shell rail's profile menu.
export const profileRouteRef = createRouteRef();

// The fleet-wide session list (`/sessions`), the rail's Sessions.
export const sessionsRouteRef = createRouteRef();

// One session (`/sessions/<installation>/<id>`).
//
// The installation is part of the path rather than a query parameter because it
// is part of the session's identity: kagent session ids are only unique within an
// installation, so a link needs both to resolve. Ids are opaque — real ones mix
// 64-character hex strings and UUIDs — so nothing here constrains their shape.
export const sessionDetailRouteRef = createSubRouteRef({
  path: '/:installation/:sessionId',
  parent: sessionsRouteRef,
});

// The Usage page (`/usage`), the rail's Usage. It carries a tab row, one
// sub-route per view, its bare path the first, Overview. The split is not
// cosmetic: the views differ in *whose* usage they report, and a tab makes
// that structural where a heading on a shared page only made it a caveat.
export const usageRouteRef = createRouteRef();

// Its other views, each a sub-route (`UsageRouter`); the tab strip builds its
// own hrefs from the page's base path, so these are for links from elsewhere.
//
// "Cost" (`/usage/cost`): the gateway metrics broken down by agent and by
// model, plus the price-catalogue coverage that says how much the cost
// figures understate. Overview's unpriced-models warning links here.
export const usageCostRouteRef = createSubRouteRef({
  path: '/cost',
  parent: usageRouteRef,
});

// "Your sessions" (`/usage/conversations`): the reader's own slice of the
// usage.
export const usageConversationsRouteRef = createSubRouteRef({
  path: '/conversations',
  parent: usageRouteRef,
});

// "Connectors" (`/usage/connectors`): how the connectors and their tools are
// used, the muster plugin's contributed section. Offered only where muster
// contributes it; without, the address redirects to Overview.
export const usageConnectorsRouteRef = createSubRouteRef({
  path: '/connectors',
  parent: usageRouteRef,
});

// The Customize screen's Models tab (`/customize/models`): a sub-page of the
// app's Customize page, whose bare path is the list of ModelConfigs; one
// model's page, the create and edit flows and Model hosting live underneath.
export const modelsRouteRef = createRouteRef();

// Connecting a model. `new` and `hosting` are reserved words here: no
// installation can be named so.
export const newModelRouteRef = createSubRouteRef({
  path: '/new',
  parent: modelsRouteRef,
});

// One model's page (`<installation>/<namespace>/<name>`), its tabs below it.
export const modelDetailRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name',
  parent: modelsRouteRef,
});

// Editing one model (`<installation>/<namespace>/<name>/edit`): the
// Connect-a-model flow prefilled from the CR, its primary Save changes. The
// one edit shape agents, models and connectors share.
export const modelEditRouteRef = createSubRouteRef({
  path: '/:installation/:namespace/:name/edit',
  parent: modelsRouteRef,
});

// Model hosting (`hosting`), the serving layer beneath the models, as a
// tab row. Its bare path is the "Running models" view: the models served on
// the installations that have a serving layer, and the controls over them.
export const servingRouteRef = createSubRouteRef({
  path: '/hosting',
  parent: modelsRouteRef,
});

// The "GPU pools" view (`hosting/capacity`): cluster-manager's pools and the
// per-node GPU inventory on the installations that report one.
export const gpuCapacityRouteRef = createSubRouteRef({
  path: '/hosting/capacity',
  parent: modelsRouteRef,
});

// The "Model cache" view (`hosting/cache`): the cache claims cluster-manager
// lists, where a kept claim is removed.
export const modelCacheRouteRef = createSubRouteRef({
  path: '/hosting/cache',
  parent: modelsRouteRef,
});

// Model hosting's create flows, each a page of its own under the view it
// adds to (the app's one create pattern, `WizardFrame`, instead of a dialog
// over the list). Cancel returns to the view the flow was opened from; the
// outcome lands on the view that shows it.
//
// Serve model (`hosting/serve`): takes its seed from the query —
// `installation`, `backend`, `cluster`, `pool`, `preset` or `model` — so a
// pool's "Serve your first model" and a download's "Serve…" deep-link it.
export const serveModelRouteRef = createSubRouteRef({
  path: '/hosting/serve',
  parent: modelsRouteRef,
});

// Import from Hugging Face (`hosting/import`).
export const importModelRouteRef = createSubRouteRef({
  path: '/hosting/import',
  parent: modelsRouteRef,
});

// Pull model (`hosting/pull`).
export const pullModelRouteRef = createSubRouteRef({
  path: '/hosting/pull',
  parent: modelsRouteRef,
});

// Add model backend (`hosting/add-backend`).
export const addModelBackendRouteRef = createSubRouteRef({
  path: '/hosting/add-backend',
  parent: modelsRouteRef,
});

// Add GPU node pool (`hosting/capacity/add-pool`).
export const addGpuNodePoolRouteRef = createSubRouteRef({
  path: '/hosting/capacity/add-pool',
  parent: modelsRouteRef,
});

/**
 * The agent-platform shell's Customize page (`/customize`), which this
 * plugin's Agents, Skills and Models tabs attach to. A page of the app, which
 * binds it in `bindRoutes` (no plugin can name it as a default target), as it
 * binds muster's route of the same name. Unbound, the links to the screen and
 * to muster's tabs on it render as plain text. Read through
 * `useCustomizePaths` (hooks/useCustomizePaths.ts).
 */
export const customizeExternalRouteRef = createExternalRouteRef();

/**
 * The shell's home (`/`): the new-session screen, where "New session" leads,
 * with an agent preselected by `?agent=` (lib/newSessionLink.ts). A page of
 * the app, which binds it in `bindRoutes` like `customize`. Unbound, the
 * "New session" links are left out. Read through `useNewSessionHref`.
 */
export const newSessionExternalRouteRef = createExternalRouteRef();

/**
 * muster's Connectors tab (`/customize/connectors`): the connectors list,
 * with a search over server and tool names (`?q=`) and the section's scope
 * (`?installation=`).
 *
 * Resolves automatically when the muster plugin is enabled (it registers this
 * target), and is unbound otherwise -- every call site handles `undefined`.
 */
export const musterServersExternalRouteRef = createExternalRouteRef({
  defaultTarget: 'muster.mcpServers',
});

/**
 * A connector's page in muster's plugin
 * (`/customize/connectors/<installation>/<server>`). `server` is the page
 * segment: the family name for a server family, the CR name for a singular
 * server.
 */
export const musterServerExternalRouteRef = createExternalRouteRef({
  params: ['installation', 'server'],
  defaultTarget: 'muster.mcpServer',
});

/**
 * A tool's page beneath the MCP server offering it
 * (`/customize/connectors/<installation>/<server>/tools/<tool>`), where the
 * tool can be inspected and run. `server` is the server page segment (the
 * family name for a family, `muster` for muster's own tools), `tool` the full
 * muster name.
 */
export const musterServerToolExternalRouteRef = createExternalRouteRef({
  params: ['installation', 'server', 'tool'],
  defaultTarget: 'muster.mcpServerTool',
});

/**
 * A workflow's page in muster's plugin
 * (`/customize/workflows/<installation>/<name>`). Unbound when the muster
 * plugin is disabled.
 */
export const musterWorkflowDetailExternalRouteRef = createExternalRouteRef({
  params: ['installation', 'name'],
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
