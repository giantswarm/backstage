---
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

`agentPlatform.skills.repositories` entries accept `{url, ref, path, readOnly}`
next to a plain URL:

- `ref`: branch, tag or commit to read (default branch when unset); picked
  skills pin to the commit it resolves to.
- `path`: scan only below this directory; skill paths stay
  repository-relative. New skills are proposed below it.
- `readOnly`: skills list and can be added to agents, but the portal offers no
  Add skill or edit pull requests into the source, and the pull-request route
  refuses them.

`ref` is a branch or tag name, `refs/heads/<name>`, `refs/tags/<name>` or a
full commit id; a name that is both a branch and a tag is refused. A tag or
commit `ref` is read but takes no pull requests; a branch `ref` is the
pull-request base. A `path` that does not exist fails that source. A URL
listed twice is read once, by its first entry, and is read-only when any entry
says so. Evaluate works for every skill; one the portal cannot change gets a
report-only evaluation.

A skill page labels its ref Branch, Tag or Commit. Skills of a read-only skill-manager source offer no Edit. The skills list no longer shows the raw error when skill-manager cannot be reached.
