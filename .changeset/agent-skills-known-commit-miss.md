---
'@giantswarm/backstage-plugin-gs-backend': patch
---

`/agent-skills/content` and `/agent-skills/content/file` answer a skill path
missing from a commit whose file lists are already known with a 404 from
memory, instead of reading the repository tree (or cloning it) again on every
request.
