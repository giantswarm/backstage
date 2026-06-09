---
'app': patch
---

Migrate the Grafana plugin from `@k-phoen/backstage-plugin-grafana` to the actively maintained `@backstage-community/plugin-grafana` (v0.20.0). The exported symbols (`grafanaPlugin`, `EntityGrafanaDashboardsCard`, `isDashboardSelectorAvailable`) and the `grafana.domain` configuration are unchanged, so this is a drop-in replacement with no behavior change.
