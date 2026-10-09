import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

/**
 * The Agent Platform's "MCP Servers" tab (`/agent-platform/mcp-servers`): the
 * servers table. A tab's sub-page takes a plain route ref, so this is a root
 * of its own rather than a sub-route of a muster section.
 */
export const mcpServersRouteRef = createRouteRef();

// The MCP server registration wizard, sub-routes of the servers tab — the
// same shape as agent creation's `/new` + `/new/skills` + `/new/review` under
// the agents tab.
export const newMcpServerRouteRef = createSubRouteRef({
  path: '/new',
  parent: mcpServersRouteRef,
});

export const newMcpServerAuthRouteRef = createSubRouteRef({
  path: '/new/auth',
  parent: mcpServersRouteRef,
});

export const newMcpServerReviewRouteRef = createSubRouteRef({
  path: '/new/review',
  parent: mcpServersRouteRef,
});

export const newMcpServerVerifyRouteRef = createSubRouteRef({
  path: '/new/verify',
  parent: mcpServersRouteRef,
});

// A server's page and a tool's page beneath it. `:server` is the family name
// for a server family, the CR name for a singular server and `muster` for
// muster's own tools; `:tool` is the full muster tool name. The wizard's
// static `new` segment outranks `:server`.
export const mcpServerRouteRef = createSubRouteRef({
  path: '/:server',
  parent: mcpServersRouteRef,
});

export const mcpServerToolRouteRef = createSubRouteRef({
  path: '/:server/tools/:tool',
  parent: mcpServersRouteRef,
});

/** The Agent Platform's "Workflows" tab (`/agent-platform/workflows`). */
export const workflowsRouteRef = createRouteRef();

export const workflowDetailRouteRef = createSubRouteRef({
  path: '/:name',
  parent: workflowsRouteRef,
});

/**
 * The agent-platform shell's Customize page (`/customize`), whose Connectors
 * tab a connector's page sits under. A page of the app, bound there; unbound,
 * a connector's page links nowhere above itself.
 */
export const customizeExternalRouteRef = createExternalRouteRef();
