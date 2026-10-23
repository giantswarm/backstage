---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The workspace editor shows each source's exclusions under Exclusions, to
remove one or add one: from the repositories the source selects now, or by
typing a name it does not select yet. Its repository count follows
workspace-manager's rules: an exclusion drops a repository picked by name too,
one that names nothing selected drops nothing, and a source with filters is
counted by the manager ("counting…" until it answers), so the count is never
negative or off. The preview says how many repositories the exclusions left
out. The Workspaces list sums each source up as its owner and the number of
repositories it selects, or its filters, instead of listing every repository
and exclusion.
