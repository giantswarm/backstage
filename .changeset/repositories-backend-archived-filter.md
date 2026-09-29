---
'@giantswarm/backstage-plugin-repositories-backend': minor
---

The repositories gateway follows giantswarm-repo-manager's read tools: the
`archived` filter (a boolean) is handed on to `list_repositories`, and the
arguments the manager dropped -- `minOrphanScore`, `decision`,
`stalePeriodDays` (from `get_repository` as well) and `undeclared` -- are no
longer read. `POST /repositories/:name/decide` (`decide_repository`) is
removed with the tool.
