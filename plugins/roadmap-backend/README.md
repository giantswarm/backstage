# @giantswarm/backstage-plugin-roadmap-backend

Backend plugin (`pluginId: roadmap`) that exposes a REST API over the GitHub
Projects v2 roadmap board. It is built on the
[`@giantswarm-io/pro`](https://github.com/giantswarm/pro) core library -- the
same board logic (board registry, GraphQL queries, field semantics) that backs
the pro MCP server -- and is consumed by the roadmap frontend plugin.

All routes require an authenticated Backstage user. There are two GitHub
credential paths:

- **Reads** use the deployed GitHub App credentials via the standard
  `integrations.github` config (`ScmIntegrations` +
  `DefaultGithubCredentialsProvider`). Results are cached in memory with a
  short TTL, since board queries paginate the full project. The GitHub App
  needs org-level **Projects: read** (and **Issues: read** for sub-issue
  trees and item bodies).
- **Writes** require the caller's per-user GitHub OAuth token in the
  `X-GitHub-Token` header, so every board mutation is attributed to the
  person who made it. The backend passes the token straight through to pro
  core and never falls back to the App token for mutations. Successful
  writes invalidate the read cache. Projects v2 mutations need the classic
  `project` scope on the user token.

## Endpoints

| Route                                                                    | Purpose                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/roadmap/schema`                                                | Board fields with option/iteration values, plus configured teams                                                                   |
| `GET /api/roadmap/items`                                                 | Board items; filters: `team`, `status`, `kind`, `availability`, `quarter`, `assignee`, `state`, `updated`, `repository`, `keyword` |
| `GET /api/roadmap/items/:id`                                             | Item detail (body, comments, all field values)                                                                                     |
| `GET /api/roadmap/overview`                                              | Status/repo distribution (optional `team` filter)                                                                                  |
| `GET /api/roadmap/issues/:owner/:repo/:number/sub-issues`                | Sub-issue tree and parent of an issue                                                                                              |
| `PATCH /api/roadmap/items/:id/field`                                     | Update a board field; body `{ name, value }` (write)                                                                               |
| `POST /api/roadmap/issues/:owner/:repo/:number/sub-issues`               | Link a child issue; body `{ child }` (URL or `owner/repo#N`) (write)                                                               |
| `DELETE /api/roadmap/issues/:owner/:repo/:number/sub-issues/:subIssueId` | Unlink a child issue by its integer issue ID (write)                                                                               |

Field and option values in `PATCH` are human-readable names (e.g.
`{ "name": "Status", "value": "In Progress ⛏️" }`); the backend resolves them
to node IDs via pro's field helpers. Single-select, iteration (e.g. Quarter),
and date fields are supported.

## Configuration

```yaml
roadmap:
  # Board key from pro's registry (`roadmap` or `customer`). Required --
  # without it the endpoints return 503 and the plugin is effectively
  # disabled (customer portals never set it).
  board: roadmap
  # Team field values the portal scopes its views to by default. Exposed
  # to the frontend via GET /schema as `defaultTeams`.
  teams:
    - Bumblebee🐝
```

For local development the dev GitHub App must have the Projects org
permission; a PAT-style `integrations.github` token works as a fallback
(same pattern as the plans plugin).
