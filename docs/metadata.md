# Catalog entity metadata

This page documents well-known annotations and labels used in Backstage as provided by Giant Swarm.

## Annotations

### backstage.io/kubernetes-id

Used by the standard Kubernetes integration. See [upstream documentation](https://backstage.io/docs/features/kubernetes/configuration/#common-backstageiokubernetes-id-label) for details.

### backstage.io/source-location

See [upstream documentation](https://backstage.io/docs/features/software-catalog/well-known-annotations/#backstageiosource-location).

In our case, this is expected to provide the URL of the source code repository of the component entity.

### backstage.io/techdocs-ref

See [upstream documentation](https://backstage.io/docs/features/software-catalog/well-known-annotations/#backstageiotechdocs-ref).

### giantswarm.io/base

Base domain of a Giant Swarm installation.

### giantswarm.io/custom-ca

This annotation should be set on an installation resource if the installation uses a custom certificate authority (CA) to sign TLS certificates, instead of a well-known one. The value is a URL where users can find the CA certificate to install.

### giantswarm.io/deployment-names

This annotation is used on component entities, to find related deployments in Kubernetes clusters.

The value is a list of names to use for looking up deployments (App or HelmRelease resources) in Kubernetes clusters. Multiple names can be specified, separated by commas.

### giantswarm.io/escalation-matrix

This annotation is used on installation resource entities to specify the escalation matrix for incidents. It is expected to contain a multi line string with human-readable information and contact details.

### giantswarm.io/grafana-dashboard

This annotation is used on component entities to specify the Grafana dashboard to link to. The value must be the path part of the dashboard URL, starting with `/`. The host name part will be generated based on the respective installation's base domain.

### giantswarm.io/icon-url

If this annotation is present, the value is used as the URL of the icon shown in the entity header of the entity.

### giantswarm.io/ingress-host

An annotation we set on component entities in rare cases to provide a link from the component's deployments list to the (only) ingress URL of a web application.

### giantswarm.io/latest-release-date

Specifies the date and time of the latest release (as in a new tagged release in the revision control system) of a component entity. Value must be a string in ISO 8601 format.

### giantswarm.io/latest-release-tag

The version tag of the latest release (as in a revision control system) of a component entity.

### github.com/project-slug

See [upstream documentation](https://backstage.io/docs/features/software-catalog/well-known-annotations/#githubcomproject-slug).

This annotation is needed to enable several features linked to the GitHub repository of the component entity, like a link to the source code repo, displaying GitHub pull request, and GitHub action runs.

## Labels

### giantswarm.io/customer

Name of the Giant Swarm customer an entity is associated with. This is only supposed to be used in Giant Swarm's internal developer portal.

### giantswarm.io/pipeline

Distinguishes between several types of installation resources. Values like `stable`, `ephemeral`, `testing` and more are possible.

### giantswarm.io/provider

Name of the infrastructure provider backing a Giant Swarm installation. Values are e. g. `aws`, `azure` etc.

### giantswarm.io/region

Name of the cloud provider region or data center location a Giant Swarm installation is running in. E. g. `cn-northwest-1`.
