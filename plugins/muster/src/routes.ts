import {
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const mcpServersRouteRef = createSubRouteRef({
  path: '/mcp-servers',
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
