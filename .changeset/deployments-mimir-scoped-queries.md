---
'@giantswarm/backstage-plugin-gs': patch
---

The Deployments page scopes its Mimir workload queries to the clusters it
shows — the one cluster of a cluster's deployments tab, otherwise each
installation's management cluster and the target clusters of its Apps and
HelmReleases — instead of aggregating over every cluster of the installation,
which timed Mimir out under load. Every Mimir query now retries at most once
(and never after a 401, 403 or 404), so a slow Mimir no longer multiplies one
timeout into four logged failures.
