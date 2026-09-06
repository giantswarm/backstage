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

## GitHub as the person

Every board read and write runs as the signed-in person: the frontend forwards
the user's main login (Dex) ID token in the `backstage-muster-authorization`
header (the same credential the muster plugin sends), the roadmap backend runs
pro's board tools through muster with it, and muster holds the person's GitHub
grant. No GitHub token and no GitHub App identity exist in the portal, so every
mutation is attributed to the person who made it and reads see what they can
see.

A person whose muster session has no GitHub grant yet sees a **Connect
GitHub** alert instead of the board; the button opens muster's sign-in (a
redirect without a consent prompt when the GitHub App is already authorized,
i.e. after the Dex GitHub login) and the page reloads once muster confirms the
connection. Users without org access or project write permission get GitHub's
403 surfaced inline; there is no separate permission model in Backstage.

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

See `plugins/roadmap-backend/README.md` for the backend configuration
(`roadmap.muster`) and the permissions the person's GitHub grant needs.
