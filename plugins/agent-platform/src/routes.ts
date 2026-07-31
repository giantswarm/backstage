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

export const newAgentSkillsRouteRef = createSubRouteRef({
  path: '/new/skills',
  parent: agentsRouteRef,
});

export const newAgentReviewRouteRef = createSubRouteRef({
  path: '/new/review',
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
