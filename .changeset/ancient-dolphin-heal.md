---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Keep private skill repository metadata through a cached catalog reload so the wizard's Skills step continues to render. Refetch older catalog cache entries whose private repository metadata was lost during persistence.
