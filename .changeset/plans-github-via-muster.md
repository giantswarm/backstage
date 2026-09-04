---
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-plans-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'app': minor
---

The plans plugin reaches GitHub through muster as the signed-in person; the
portal holds no GitHub credential. The frontend forwards the user's main
login (Dex) ID token in `backstage-muster-authorization`, and the plans
backend runs the GitHub MCP server's tools through muster with it
(`plans.muster: { installation, server, toolPrefix? }`), which holds the
person's GitHub grant. A person without a grant gets a "Connect GitHub" step
(`GET /api/plans/connection`, a 401 `GithubNotConnectedError` carrying
muster's sign-in URL) instead of a GitHub App login; inline review comments
are written through a pending review. The `X-GitHub-Token` header and the
Backstage `github` auth provider are no longer used by plans. The app wires
`plansAuthApiRef` to the main login provider (`PlansMainAuth`).

The muster MCP client and its auth-tool parsing move from
`@giantswarm/backstage-plugin-muster-backend` to
`@giantswarm/backstage-plugin-gs-node` (`MusterMcpClient`,
`readMusterInstallationsFromConfig`, `parseAuthLoginResult`,
`MUSTER_AUTH_HEADER`, new `callToolContent`), so every backend plugin that
calls muster on the user's behalf shares one implementation.
