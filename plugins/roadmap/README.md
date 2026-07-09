# @giantswarm/backstage-plugin-roadmap

Frontend plugin (`pluginId: roadmap`) for the GitHub Projects roadmap board,
served by the roadmap-backend plugin. New Frontend System plugin; all
extensions ship `disabled: true` so customer portals never see it --
internal portals opt in via `app.extensions`.

## Views

- **Board** (`/roadmap`): status-lifecycle columns (Inbox → Backlog → Up
  Next → In Progress → Validation → Done), filterable by Team, Kind,
  Quarter, Availability, and keyword. Cards move between columns by drag
  and drop or a per-card status menu.
- **Team activity** (`/roadmap?view=activity`): who is working on what --
  In Progress and Validation items grouped by assignee, with unassigned
  in-flight work called out explicitly, per-status counts, and items that
  moved in the last week.
- **Item detail** (`/roadmap/items/:id`): issue body, comments, board
  fields editable inline, and the sub-issue tree with link/unlink.

## Writes and GitHub attribution

Reads go through the backend's shared GitHub App token. Writes (status and
field changes, sub-issue linking) send the caller's per-user GitHub OAuth
token in the `X-GitHub-Token` header, so every board mutation is attributed
to the person who made it. The token comes from the portal's existing
`githubAuthApiRef` session; Projects v2 mutations additionally need the
classic `project` scope, which is requested incrementally on the first
write (a one-time consent prompt for roadmap users only).

Users without org access or project write permission get GitHub's 403
surfaced inline; there is no separate permission model in Backstage.

## Enabling

```yaml
app:
  extensions:
    - page:roadmap
    - api:roadmap

roadmap:
  board: roadmap
  teams:
    - Bumblebee🐝
```

See `plugins/roadmap-backend/README.md` for the backend configuration and
GitHub App permission requirements.
