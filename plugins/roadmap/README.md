# @giantswarm/backstage-plugin-roadmap

Frontend plugin for the GitHub Projects roadmap board, backed by
`@giantswarm/backstage-plugin-roadmap-backend`.

## Views

- **Board** (`/roadmap`): one column per Status lifecycle stage
  (Inbox → Backlog → Up Next → In Progress → Validation → Done), filterable
  by Team, Kind, Availability, and Quarter. The status select on each card
  moves items between columns.
- **Team activity** (`/roadmap?view=team`): items in In Progress and
  Validation grouped by assignee, with unassigned active work called out and
  a status distribution summary per team.
- **Item detail** (`/roadmap/item/:itemId`): issue body, inline-editable
  board fields, the sub-issue tree with link/unlink, and in-portal links to
  plans (from the plans plugin) referencing the epic.

## Gating

Both extensions ship disabled and must be opted into per deployment
(internal portals only):

```yaml
app:
  extensions:
    - page:roadmap
    - api:roadmap
roadmap:
  teams:
    - Team Bumblebee🐝
```

## Writes

Board mutations (status/field changes, sub-issue linking) use a per-user
GitHub OAuth token obtained via `githubAuthApiRef` with the `repo` and
`project` scopes, requested incrementally on the first write. GitHub
attributes every change to the acting user; users without board access get
GitHub's 403 surfaced as an alert.
