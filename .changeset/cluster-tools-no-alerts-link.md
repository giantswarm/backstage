---
'@giantswarm/backstage-plugin-gs': patch
---

The cluster details page no longer shows an Alerts link by default. It pointed at Grafana's alerting page in the Giant Swarm organization, which customers can't open. An instance that wants the link configures it in `gs.clusterDetails.resources`.
