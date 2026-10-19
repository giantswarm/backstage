import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

/**
 * The Customize screen's Connectors tab (`/customize/connectors`): the
 * connector pages, the tools beneath them and the registration wizard. A
 * sub-page of the app's Customize page, so its route refs resolve under it;
 * the list at the bare path is the Customize screen's own.
 */
export const mcpServersRouteRef = createRouteRef();

// The registration wizard (`new`, `new/auth`, `new/verify`) — the same shape
// as agent creation's `new` + `new/skills` + `new/review` under the agents
// tab. `new` is a reserved word here: no installation can be named so.
export const newMcpServerRouteRef = createSubRouteRef({
  path: '/new',
  parent: mcpServersRouteRef,
});

export const newMcpServerAuthRouteRef = createSubRouteRef({
  path: '/new/auth',
  parent: mcpServersRouteRef,
});

export const newMcpServerVerifyRouteRef = createSubRouteRef({
  path: '/new/verify',
  parent: mcpServersRouteRef,
});

// A connector's page and a tool's page beneath it, on the installation that
// runs them: identity lives in the path, never in the query. `:server` is
// the family name for a server family, the CR name for a singular server and
// `muster` for muster's own tools; `:tool` is the full muster tool name. Two
// segments, so a connector page never reads as the list's sub-tabs
// (`infrastructure`, `internal`), which are one.
export const mcpServerRouteRef = createSubRouteRef({
  path: '/:installation/:server',
  parent: mcpServersRouteRef,
});

export const mcpServerToolRouteRef = createSubRouteRef({
  path: '/:installation/:server/tools/:tool',
  parent: mcpServersRouteRef,
});

// Editing a registered connector: the registration wizard prefilled, its
// steps under the connector's own address (`edit`, `edit/auth`,
// `edit/verify`), the one edit shape agents and models share.
export const editMcpServerRouteRef = createSubRouteRef({
  path: '/:installation/:server/edit',
  parent: mcpServersRouteRef,
});

export const editMcpServerAuthRouteRef = createSubRouteRef({
  path: '/:installation/:server/edit/auth',
  parent: mcpServersRouteRef,
});

export const editMcpServerVerifyRouteRef = createSubRouteRef({
  path: '/:installation/:server/edit/verify',
  parent: mcpServersRouteRef,
});

/** The Customize screen's Workflows tab (`/customize/workflows`). */
export const workflowsRouteRef = createRouteRef();

/** One workflow's page, on the installation it runs on. */
export const workflowDetailRouteRef = createSubRouteRef({
  path: '/:installation/:name',
  parent: workflowsRouteRef,
});

/**
 * The agent-platform shell's Customize page (`/customize`), whose Connectors
 * tab a connector's page sits under. A page of the app, bound there; unbound,
 * a connector's page links nowhere above itself.
 */
export const customizeExternalRouteRef = createExternalRouteRef();

/**
 * The Usage page's Connectors view (`/usage/connectors`), every connector's
 * tool calls on an installation, which a connector's Usage tab opens. A page
 * of the agent-platform plugin, bound by the app; unbound, the tab has no
 * link there.
 */
export const usageConnectorsExternalRouteRef = createExternalRouteRef();
