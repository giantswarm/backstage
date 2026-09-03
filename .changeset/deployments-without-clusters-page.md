---
'@giantswarm/backstage-plugin-gs': patch
---

Stop the Deployments pages from crashing when the Clusters page is disabled.

With `page:gs/deployments` enabled but `page:gs/clusters` disabled in
`app.extensions`, the clusters routes are never registered and `useRouteRef`
returns `undefined`. Four call sites asserted the result non-null and crashed
the page with `TypeError: t is not a function` when calling it:

- the Cluster column and the Name column in `DeploymentsTable`
- the Installation link in `DeploymentAboutCard`
- the shared `ClusterLink` component (used by the deployment About card and
  the workload details pane)

These now degrade gracefully: when the target page's route is not registered,
the cluster (or deployment) is rendered as plain text instead of a link.
