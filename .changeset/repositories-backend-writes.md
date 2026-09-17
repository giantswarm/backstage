---
'@giantswarm/backstage-plugin-repositories-backend': minor
---

Add the write routes of the repositories gateway, each one tool call of
giantswarm-repo-manager as the signed-in person: `POST /repositories/validate`
(`validate_repository`, the dry run), `POST /repositories`
(`create_repository`), `POST /repositories/:name/update|transfer|lifecycle|
reconcile` (`update_repository`, `transfer_repository`, `set_lifecycle`,
`reconcile_repository`) and `POST /repositories/:name/decide`
(`decide_repository`). The body carries the tool's own arguments, type-checked
and handed on unchanged — `dryRun` and `mode` included, so the manager's
refusal of anything but `commit` is its own. A tool-level refusal is a 403
carrying the manager's reason; a broken hop stays a server fault.
