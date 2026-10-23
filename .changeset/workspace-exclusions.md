---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The workspace editor shows each source's exclusions under Exclusions, to
remove one or add one: from the repositories the source selects now, or by
typing a name it does not select yet. Its repository count follows
workspace-manager's rules: an exclusion drops a repository picked by name too,
one that names nothing selected drops nothing, a name picked twice in
different case counts once, and a source with filters is counted by the
manager ("counting…" until it answers, "total not known" when it cannot), so
the count is never negative or off. The preview says how many repositories
the exclusions left out. The Workspaces list drops its Sources column, which
listed every repository and exclusion; the sources are on the workspace's
page, and the Repositories column no longer cuts its header short.
