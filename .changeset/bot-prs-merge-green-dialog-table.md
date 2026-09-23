---
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Bot PRs: the Approve and merge dialog reads as a table. Its title matches the
button that opens it, the intro is two sentences, and the preview is one row
per PR in the page's own columns — Team (only when there is more than one),
Repository, Pull request (without the shared `chore(deps):` prefix) and Result,
where a green PR says the step the run takes and any other PR leads with its
class and the reason. A PR that is no longer green is called out above the
table and left out of the apply, so the button's count is what gets merged.
Skeleton rows stand in while the preview runs, the dialog stays dismissable
until Apply is pressed, and the preview stays readable while the apply runs. A
repository marge could not read, a failure no rule matches and an unreadable
rule catalogue are alerts after the table. Once it has run, Close is the only
button. The sweep dialog shares the table.

ui-react's `ConfirmDialog` takes `isDone`: the confirm button goes and Cancel
becomes Close.
