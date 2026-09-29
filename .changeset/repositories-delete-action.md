---
'@giantswarm/backstage-plugin-repositories': minor
'@giantswarm/backstage-plugin-repositories-backend': patch
---

The Repositories page gains **Delete**: a red button apart from the other row
actions of the expanded record. Its dialog says what the reconciler does
(the repository's CircleCI project unfollowed, the repository deleted on GitHub
with its code, issues, pull requests, releases and packages; the entry kept in
the team file as the record; restorable by an organization owner for 90 days),
asks the person to type the repository's name and takes a reason, then runs
`set_lifecycle` with `lifecycle: deleted` and the typed name as `confirm` --
the manager refuses a deletion without it -- through the dry run and the
commit like Archive: the pull request is opened as the person and a member of
the owning team other than the author approves. `deleted` joins the lifecycle
filter; the backend passes `confirm` through.
