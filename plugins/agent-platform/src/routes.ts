import {
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

export const newAgentReviewRouteRef = createSubRouteRef({
  path: '/new/review',
  parent: agentsRouteRef,
});
