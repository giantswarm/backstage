# Backstage Catalog

### Entity data and metadata

Annotations:

- 'backstage.io/source-location': URL of the source code repository of the component entity.
- 'backstage.io/techdocs-ref': URL of the TechDocs documentation of the component entity.
- 'github.com/project-slug': Project slug of the component entity in GitHub.
- 'github.com/team-slug': Owner team slug of the component entity in GitHub.
- 'circleci.com/project-slug': Project slug of the component entity in CircleCI.
- 'giantswarm.io/deployment-names': List of names to use for looking up deployments in Kubernetes clusters, comma separated.
- 'giantswarm.io/latest-release-date': Date and time of the latest release (as in a new tagged release in the revision control system) of the component entity.
- 'giantswarm.io/latest-release-tag': Version tag of the latest release (as in a revision control system) of the component entity.
- 'giantswarm.io/escalation-matrix': Contact information and procedure for escalating incidents in an installation.
- 'giantswarm.io/grafana-dashboard': Path part of the Grafana dashboard to link to.
- 'giantswarm.io/ingress-host': Host name part of the ingress URL of a web application.
- 'giantswarm.io/custom-ca': URL where users can find the CA certificate to install.
- 'giantswarm.io/base': Base domain of a Giant Swarm installation.

Tags:

- 'defaultbranch:master': The source repository's default branch is 'master', which we consider a legacy. We prefer 'main' as the default branch
- 'flavor:app': The repository is an app repository
- 'flavor:customer': The repository is a customer repository we use for issue tracking
- 'flavor:cli': The repository is a CLI repository
- 'language:go': The repository is considered a Go repository
- 'language:python': The repository is considered a Python repository
- 'no-releases': The repository does not have releases
- 'private': The repository is private
- 'helmchart': The repository has at least one Helm chart
- 'helmchart-deployable': The repository has at least one Helm chart that is deployable as an application (as opposed to a library chart or a cluster chart)
- 'helmchart-audience-all': The repository has at least one Helm chart that is intended for customers

## When presenting catalog info

- When showing information about a component, user, system, group, or other entity, make it a clickable link to the entity page in the Backstage developer portal.
  - Examples:
    - Team [area-kaas](/catalog/default/group/area-kaas)
    - Component [observability-operator](/catalog/default/component/observability-operator)
    - System [App Platform](/catalog/default/system/app-platform)
