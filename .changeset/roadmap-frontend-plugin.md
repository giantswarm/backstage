---
'@giantswarm/backstage-plugin-roadmap': minor
---

Add the roadmap frontend plugin: a `/roadmap` page over the GitHub Projects
roadmap board, served by the roadmap-backend plugin.

- **Board** view renders the status lifecycle as columns (Inbox → Backlog →
  Up Next → In Progress → Validation → Done), filterable by Team, Kind,
  Quarter, Availability, and keyword. Cards move between columns by drag
  and drop or a per-card status menu, with an optimistic in-place move.
- **Team activity** view shows who is working on what: In Progress and
  Validation items grouped by assignee, unassigned in-flight work called
  out explicitly, per-status counts, and items updated in the last week.
- **Item detail** page (`/roadmap/items/<id>`) renders the issue body and
  comments, board fields editable inline (single-select, iteration, and
  date fields from the board schema), and the sub-issue tree with
  link/unlink.
- Reads go through the backend's shared GitHub App token. Writes send the
  caller's per-user GitHub OAuth token (from the portal's existing
  `githubAuthApiRef` session) in the `X-GitHub-Token` header so board
  mutations are attributed to the person; the classic `project` scope
  Projects v2 mutations need is requested incrementally on the first write.
- The page and API extensions are disabled by default and must be enabled
  via `app.extensions` app-config, so customer portals are unaffected.
