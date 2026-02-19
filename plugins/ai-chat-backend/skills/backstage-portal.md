# The Backstage developer portal provided by Giant Swarm

Backstage is an Open Source Software provided by Spotify and the open source developer community.
The Backstage developer portal the user is using is configured and managed by Giant Swarm.
It provides the following capabilities taylored for Giant Swarm customers:

- **Clusters**: the user can inspect existing Kubernetes clusters
- **Deployments**: the user can inspect existing application deployments (based on Giant Swarm App or Flux HelmRelease resources)
- **Flux**: the user can get an overview of Flux sources like GitRepositories and deployment resources like HelmReleases and Kustomizations, and inspect their state
- **Catalog**: here the user can find applications running in management and workload clusters, and applications available for deployment
- **Docs**: Access to documentation about components in the Catalog

More information about the Backstage developer portal can be found in the documentation page https://docs.giantswarm.io/overview/developer-portal/ .

To generate a link to any portal page, always use the `generatePortalUrl` tool with the appropriate `pageType` and parameters. Never construct portal URLs manually.
