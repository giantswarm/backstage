---
'@giantswarm/backstage-plugin-gs': patch
---

Cluster page: a cluster installed by a Flux HelmRelease, as every cluster cluster-manager creates is, opens its Overview instead of an `apps.application.giantswarm.io … not found` error. Where a cluster has no App, the page reads the HelmRelease of the same name in its namespace: an **Installed by** card on the Overview shows its name (linked to its deployment page), chart, version, status and, while it is not ready, its Ready message; the GitOps card reads it; and while its Cluster does not exist yet, the page shows the release's conditions as it shows the App's status today. An App-based cluster's page is unchanged.
