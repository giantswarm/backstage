---
'@giantswarm/backstage-plugin-repositories': patch
---

The Repositories page reads a repository's set-up state from one place for
the row's icon and the expanded record's header, so the two never disagree:
the header prints the icon's words (`run pending · not reconciled yet`,
`refused · the last check failed`, `converged · set up as declared`, …) in
the colour of the icon's mark, with the detail on hover -- the steps not ok,
the dispatch a pending run waits on, the schema's problems with a refused
entry. A declaration the engine refused reads `refused` whatever the
engine's result says of convergence, beside the Declaration refused alert
instead of `converged` next to it. The expanded record is re-read every
15 s while a run is pending, not only while its set-up has not converged.
