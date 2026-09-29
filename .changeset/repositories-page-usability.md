---
'@giantswarm/backstage-plugin-repositories': minor
---

The Repositories page rebuilt for use, from the portal's own building blocks.

- The summary tiles (set-up state, orphan score, lifecycle) are gone, and so
  is the orphan score everywhere: no column, no filter, no facts. The table
  lists by repository name.
- No decision tracking: _Keep_ and its dialog are gone; ownership moves or a
  repository is archived right away through _Transfer_, _Deprecate_ and
  _Archive_.
- Archived repositories are hidden by default (the listing asks for
  `archived=false`); _Show archived_ lists them, and the URL keeps the choice.
  The lifecycle filter offers any / active / deprecated / archived.
- Every filter works: the Team and Finding options come from the scope's
  whole inventory rather than the rows a filter already narrowed, so no team
  vanishes from the list; the team goes to the manager under every scope
  where it applies and is not offered under _Unassigned_; _Fork_ sends a
  boolean, _Inactive for (days)_ a number; the search waits for the person to
  pause.
- The page uses what the other pages use: the Clusters page's filter column
  (`FiltersLayout`, `SingleSelect`, `Autocomplete`), the `Table` of
  `@backstage/core-components` with its detail panel and sorting, `StatusLabel`
  for the set-up state and the step verdicts, `InfoCard` and `FactList` for the
  record.
- The expanded row is redesigned: a header with the repository link, its
  set-up state and the actions; the facts grouped as Ownership, Activity and
  Tooling with empty ones left out; the findings as a readable list with their
  fix; the set-up steps as a compact table whose verdict is a status icon and
  word with the detail text wrapped.
- `yarn start` in the plugin serves the page over the fixture records for
  development, without a backend.
