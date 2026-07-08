---
'@giantswarm/backstage-plugin-roadmap-backend': minor
'@giantswarm/backstage-plugin-roadmap': minor
---

Add the roadmap plugin pair serving the GitHub Projects roadmap board via the
`@giantswarm/pro` board core.

- The backend proxies board reads (schema, filtered item lists, item detail,
  sub-issue tree, issue-to-item resolution) using the deployed GitHub App
  credentials with short-TTL caching, and board writes (field updates,
  sub-issue link/unlink) with a per-user GitHub OAuth token from the
  `X-GitHub-Token` header so mutations are attributed to the acting user.
- The frontend adds a status-lifecycle board view with inline status editing,
  a team activity view grouping active work by assignee (unassigned work
  called out), and an item detail view with editable board fields, sub-issue
  management, and in-portal links to plans referencing the epic.
- Both extensions (`page:roadmap`, `api:roadmap`) ship disabled and are
  opted into per deployment, the same gating as the plans plugin.
