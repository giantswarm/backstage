---
'@giantswarm/backstage-plugin-repositories': minor
---

_Align now_ is one dialog. A declared repository has nothing to fill in, so
the manager's dry run starts as the dialog opens -- no Review step -- and
the dialog says in one sentence what the commit does (aligned now; the
opt-in pull request opened, whose merge aligns; a check), links the
intranet's repository set-up page for the rest, and lists the changes the
last check planned with when it checked. The manager's paragraph-long
warning, the opt-in plan (entry before and after, pull request, ask) and the
dispatch preview are no longer repeated in the dialog. An undeclared
repository asks for the team and _Check now_ dispatches the check directly.
`ActionDialog` runs its dry run on open when it has no form fields.

A row action's result stays on screen: the record and the listing are
re-read when its dialog closes, not the moment the write lands -- the
re-read listing re-mounted the detail panel and took the dialog with its
_Pull request opened_ or _Dispatched_ view away.
