# The Backstage developer portal provided by Giant Swarm

Backstage is an Open Source Software provided by Spotify and the open source developer community.
The Backstage developer portal the user is using is configured and managed by Giant Swarm.
It provides the following capabilities taylored for Giant Swarm customers:

- [Clusters](/clusters): the user can inspect existing Kubernetes clusters
- [Deployments](/deployments): the user can inspect existing application deployments (based on Giant Swarm App or Flux HelmRelease resources)
- [Flux](/flux): the user can get an overview of Flux sources like GitRepositories and deployment resources like HelmReleases and Kustomizations, and inspect their state
- [Catalog](/catalog): here the user can find applications running in management and workload clusters, and applications available for deployment
- [Docs](/docs): Access to documentation about components in the Catalog

More information about the Backstage developer portal can be found in the documentation page https://docs.giantswarm.io/overview/developer-portal/ .

URL patterns for all portal pages are provided in your system prompt under "Portal URL patterns". Refer to those when constructing links.
