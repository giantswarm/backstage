---
'@giantswarm/backstage-plugin-repositories': minor
'@giantswarm/backstage-plugin-repositories-backend': minor
---

The Repositories page's _Reconcile now_ becomes _Align now_, and its dialog
says what the run does before the person confirms it.

- The row action, the dialog title and the confirm label read _Align now_;
  the backend maps `POST /repositories/:name/align` to the manager's
  `align_repository` tool (`RepositoriesApi.alignRepository`; the
  `reconcile` route and `reconcileRepository` are gone).
- The dialog states plainly that the run changes the repository on GitHub and
  CircleCI to its declared set-up and the company baseline, as the signed-in
  person.
- The dry run renders the manager's answer: its warning, the opt-in line --
  the owning team has opted in and the changes below are applied, or it has
  not and the run checks and changes nothing -- and the changes the last
  check planned, per step, with when they were checked ("no check yet" and
  "nothing to change" named as such), then the workflow dispatch as before.
  Without the team's opt-in the confirm label reads _Check now_.
