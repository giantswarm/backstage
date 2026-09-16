---
'@giantswarm/backstage-plugin-repositories': minor
---

Add the repositories frontend plugin: a `/repositories` page behind a
_Repositories_ sidebar entry that shows the org's repository inventory from
giantswarm-repo-manager, read as the signed-in person.

- Scopes _My team_ (the default; _Unassigned_ for a Planeteer), _Unassigned_
  and _All repositories_, kept in the URL.
- Tiles counting the listed repositories per set-up state, orphan score band
  and lifecycle.
- The manager's filters (search, Renovate state, team including no team,
  visibility, fork, lifecycle, inactivity, minimum orphan score, decision,
  finding), each a URL parameter passed to `list_repositories` unchanged.
- A table sortable by every column; a row expands to the full inventory record
  with its findings and fix text, the links (repository, catalog entity, last
  reconciler run, latest release), the set-up steps laid out as `devctl repo
status` prints them and re-read every 15 s while they converge, and the
  record's age with _Refresh_.
- A person without a grant for the manager is sent through muster's connect
  once and lands back on the page.
- The page and API extensions are disabled by default and must be enabled via
  `app.extensions` (`page:repositories`, `api:repositories`), so customer
  portals are unaffected.
