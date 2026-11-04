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
