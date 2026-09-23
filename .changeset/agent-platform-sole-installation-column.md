---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Model configs, GPU node pools, model cache and GPU capacity tables leave
out the Installation column when their rows can only come from one
installation — one pinned in the header, or only one that answered — as the
Agents and Sessions lists already do. All five tables now share one rule for it.
