---
'@giantswarm/backstage-plugin-repositories': minor
---

_Align now_ on a repository that has not opted in to alignment opts it in
and aligns it. The dialog renders the manager's three modes: opted in
(`align: true` in its team-file entry), the set-up workflow is dispatched
and the button reads _Align now_; declared but not opted in, the dry run
shows the entry as it will read, the pull request and the ask the team's
channel receives, the button reads _Opt in and align_, the commit opens that
pull request as the person and the reconciler aligns the repository when it
merges -- nothing is dispatched; without an entry, the run checks from the
team alone and the button reads _Check now_. The opt-in line names the
repository, not its team. `Alignment.mode` gains `'opt-in'` and
`Alignment.optIn` carries the manager's plan and, after the commit, the pull
request and the delivered ask.
