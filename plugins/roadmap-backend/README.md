# @giantswarm/backstage-plugin-roadmap-backend

Backend plugin (`pluginId: roadmap`) that exposes a REST API over the GitHub
Projects v2 roadmap board, consumed by the roadmap frontend plugin. The board
logic lives in [pro](https://github.com/giantswarm/pro), the MCP server behind
the `pro` tools; this plugin runs those tools through muster.

All routes require an authenticated Backstage user and run as that person:
the frontend sends the user's main login (Dex) ID token in the
`backstage-muster-authorization` header, the backend calls pro's tools
(`list_issues`, `get_board_schema`, `get_item_by_issue`, `get_issue_details`,
the sub-issue tools, `update_issue_field`) through the muster installation
named in `roadmap.muster`, and muster executes them with the person's own
GitHub grant -- reads and writes alike. No GitHub App token is used anywhere.

Board reads are kept per person in the plugin's database (table
`roadmap_board_reads`, keyed by the person's user entity ref), so every
backend instance serves them, after a restart too: a board read paginates the
project 100 items per sequential GitHub call, and a team's Done column takes
40-55 s. A read is fresh for 5 minutes (the schema for 10); an older one is
answered at once while one background refresh per instance replaces it
(stale-while-revalidate), however old it is. An hourly task drops the reads
nobody has asked for in 30 days. Writes patch the person's stored lists in place. When
the database fails, reads come from pro as on a cold start, and writes
answer with pro's result. A read made with
one person's grant is never served to another person.

A caller whose muster session has no grant yet gets `401` with
`error.name: MusterServerNotConnectedError` and `error.authUrl`, muster's
sign-in URL; `GET /api/roadmap/connection` reports the same without failing a
request, so the frontend can offer "Connect GitHub" and poll until the person
completed it.

## Endpoints

| Route                                                                    | Purpose                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/roadmap/connection`                                            | Whether the caller can reach the board, else the sign-in URL                                                                       |
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
  # The pro MCP server behind muster that serves the board as the person.
  muster:
    installation: golem # a name from muster.installations
    server: mcp-pro # the pro MCPServer in that muster
    toolPrefix: pro # tools are x_<prefix>_<tool>; default: the server name
```

Without `roadmap.board` or `roadmap.muster` the endpoints return 503. The
person's GitHub grant needs org-level Projects access (read for the board,
write for field changes) and Issues access for sub-issue trees and bodies;
with a GitHub App as muster's client, the App's permissions and installation
decide what the grant can reach.
