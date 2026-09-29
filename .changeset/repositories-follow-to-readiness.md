---
'@giantswarm/backstage-plugin-repositories': minor
'@giantswarm/backstage-plugin-repositories-backend': minor
---

Create repository follows the new repository to readiness on the page. After
`create_repository` answers, the page calls the manager's `watch_repository`
with the pull request it opened (one call blocks 20 s at most, called again
while the repository is neither ready nor failed) and renders the phases as
they complete -- created, scaffolded, declared, merged, set up, released --
with their time since the creation, the manager's reason while a phase waits
(the release's CircleCI statuses reported and what is awaited, the settle
window), and a failure with the manager's reason (a red first release names
the job). The repository is linked and marked ready only when every phase is
done; until then it is the name with the phase list. The reconciler run's
findings show once it has reported, and the record's set-up steps beneath.

The same phase list follows an _Align now_ dispatch through the record: its
pending run, then the run's report with the verdict and the run linked, or
the inventory's `reconcile-run-missing` finding when the run never reported.
The expanded row names a pending reconciler run and the change a run
followed.

Backend: `POST /repositories/:name/watch` (`pullRequest`, `timeout`) runs
`watch_repository` as the person.
