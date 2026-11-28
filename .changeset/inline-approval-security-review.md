---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

The inline approval card shows everything muster's view covers, keeps Approve and Decline inert until seen for a second (Approve until all collapsed values are opened), and the muster backend sends the portal's workload token (`muster.workloadTokenFile`) as muster requires.
