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

A tag or commit `ref` (also on generic git hosts) is read but takes no pull
requests; a branch `ref` is the pull-request base. A URL listed twice is read
once, by its first entry. Evaluate works for every skill; one the portal
cannot change gets a report-only evaluation.
