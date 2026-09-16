# @giantswarm/backstage-plugin-repositories

Frontend plugin (`pluginId: repositories`) that renders the Repositories page:
the org's repository inventory from
[giantswarm-repo-manager](https://github.com/giantswarm/giantswarm-repo-manager),
read as the signed-in person. It answers "what do my team's repositories look
like", "who owns X" and "what is abandoned" over the manager's two read tools,
with no composition of its own -- what the page shows for a repository is what
`devctl repo status` prints for it, from the same record.

## Features

- **Scopes**: _My team_ (default; _Unassigned_ for a Planeteer), _Unassigned_,
  _All repositories_ -- `list_repositories`' `scope`, kept in the URL.
- **Tiles**: counts per set-up state, orphan score band and lifecycle over the
  listed repositories.
- **Filters**: search, Renovate state, team (including no team), visibility,
  fork, lifecycle, inactivity, minimum orphan score, decision, finding -- the
  tool's arguments, each a URL parameter.
- **Table**: sortable by repository, team, lifecycle, last person commit,
  score, set-up state, findings and age; the manager's order (by orphan score)
  to begin with.
- **Row expansion**: the full inventory record -- declaration, GitHub reality,
  Renovate, CircleCI, catalog and mapping, orphan reasons, every finding with
  its fix, the set-up steps (STEP / VERDICT / DETAIL and the findings, as the
  CLI prints them, re-read every 15 s while they converge), the links
  (repository, catalog entity, last reconciler run, latest release) and the
  record's age with **Refresh** (`refresh_repository`).

## Backend

Data comes from `@giantswarm/backstage-plugin-repositories-backend`, a gateway
that reaches the manager through muster. Every request carries the user's
main login (Dex) ID token; muster forwards it to the manager, which obtains
the person's GitHub grant from muster's token broker. A person without a grant
is sent through muster's connect once and lands back on the page.

## Gating

All extensions are disabled by default so customer portals never expose the
page. Enable it per deployment via app-config (the deployment also needs the
manager registered in one of its muster installations):

```yaml
app:
  extensions:
    - page:repositories
    - api:repositories
repositories:
  muster:
    installation: gazelle
    server: giantswarm-repo-manager
```
