import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const mcpServersRouteRef = createSubRouteRef({
  path: '/servers',
  parent: rootRouteRef,
});

// The MCP server registration wizard, sub-routes of the servers view — the
// same shape as agent creation's `/new` + `/new/skills` + `/new/review` under
// the agents tab.
export const newMcpServerRouteRef = createSubRouteRef({
  path: '/servers/new',
  parent: rootRouteRef,
});

export const newMcpServerAuthRouteRef = createSubRouteRef({
  path: '/servers/new/auth',
  parent: rootRouteRef,
});

export const newMcpServerReviewRouteRef = createSubRouteRef({
  path: '/servers/new/review',
  parent: rootRouteRef,
});

export const newMcpServerVerifyRouteRef = createSubRouteRef({
  path: '/servers/new/verify',
  parent: rootRouteRef,
});

export const workflowsRouteRef = createSubRouteRef({
  path: '/workflows',
  parent: rootRouteRef,
});

export const toolExplorerRouteRef = createSubRouteRef({
  path: '/tools',
  parent: rootRouteRef,
});

export const workflowDetailRouteRef = createSubRouteRef({
  path: '/workflows/:name',
  parent: rootRouteRef,
});
