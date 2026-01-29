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

## URL structure

- Clusters list
  - URI: `/clusters`
- Cluster detail page
  - URI Schema: `/clusters/:managementcluster/:org-namespace/:clustername`
  - Example: `/clusters/gazelle/org-team-tinkerers/cicddev`
- Deploymnts list
  - URI: `/deployments`
- Deployment detail page
  - URI Schema: `/deployments/:managementcluster/:type/:namespace/:appname`
  - Example:
    - `/deployments/gazelle/app/giantswarm/app-admission-controller`
    - `/deployments/gazelle/helmrelease/flux-giantswarm/backstage`
- Flux resources UI
  - List view
    - URI: `/flux`
    - URL parameters:
      - `clusters` management cluster name, can be used multiple times
    - Example: `/flux?clusters=gazelle&clusters=graveler`
  - Tree view
    - URI: `/flux/tree`
    - Example: `/flux/tree?clusters=gazelle&clusters=graveler`
