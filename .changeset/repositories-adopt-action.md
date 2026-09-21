---
'@giantswarm/backstage-plugin-repositories': minor
'@giantswarm/backstage-plugin-repositories-backend': patch
---

An undeclared repository's row -- on GitHub, in no team file, the _Unassigned_
scope -- offers **Adopt**, **Deprecate**, **Archive** and **Align now** in
place of four disabled buttons, and a line says no team file declares it.
Adopt opens the Create form on what GitHub knows of the repository -- the
team a choice, the person's own first, the name the repository's, the
description and visibility as they are, the language it is written in, the
generic nature with the CircleCI generator off, the opt-in to alignment as
the checkbox, the reason -- and runs the manager's `adopt_repository` through
the dry run and the commit like the other row actions: the entry is added to
the team's file in a pull request the team reviews. Deprecate and Archive on
an undeclared row make the same call with the lifecycle in the entry: the one
pull request declares the repository and ends its life; the team and the
reason are all there is to fill in, the manager adds the opt-in the lifecycle
needs. The backend routes `POST /repositories/:name/adopt` to
`adopt_repository`. Needs giantswarm-repo-manager 0.24.0 or later.
