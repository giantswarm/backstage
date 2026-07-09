---
'@giantswarm/backstage-plugin-roadmap-backend': minor
---

Add the roadmap backend plugin: a REST proxy over the GitHub Projects v2
roadmap board built on the `@giantswarm-io/pro` core library (shared with
the pro MCP server), consumed by the upcoming roadmap frontend plugin.

- Read endpoints (board schema, filtered item lists, item detail,
  status/repo overview, sub-issue trees) are served with the deployed
  GitHub App credentials and cached in memory with a short TTL.
- Write endpoints (board field updates, sub-issue linking/unlinking)
  require the caller's per-user GitHub OAuth token in the `X-GitHub-Token`
  header, so mutations are attributed to the person who made them; the App
  token is never used for writes. Successful writes invalidate the read
  cache.
- Config: `roadmap.board` selects the pro board and enables the plugin
  (without it the endpoints return 503, so customer portals never serve
  the board); `roadmap.teams` exposes default team scoping to the
  frontend.
