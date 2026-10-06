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

Can be set manually, or populated automatically by the `RepoContentProcessor` for components with `github.com/project-slug`, as `url:https://github.com/<slug>/tree/<default branch>` when the default branch has a `README.md`. Once the processor has a record for the repository it removes a reference the repository no longer supports.

### giantswarm.io/app-test-suite-version-source

Where the version in the `giantswarm.io/app-test-suite-version` label comes from: `repo` when the repository passes its own `app-test-suite_container_tag` to `run-tests-with-ats`, `orb-default` when it relies on the default of the architect orb release it uses. Only set together with that label.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/architect-orb-ref

The raw architect orb reference of a component whose CircleCI configuration uses a non-release ref, such as `dev:<sha>` or `volatile`. Such a ref is not a valid label value, so it is published here instead of in `giantswarm.io/architect-orb-version`, and `giantswarm.io/architect-orb-status` is `non-release`.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/base

Base domain of a Giant Swarm installation.

### giantswarm.io/default-branch

Name of the default branch of the component's repository. Populated automatically by the `RepoContentProcessor` from `github.com/project-slug`. A repository whose default branch is `master` also gets the `defaultbranch:master` tag.

### giantswarm.io/custom-ca

This annotation should be set on an installation resource if the installation uses a custom certificate authority (CA) to sign TLS certificates, instead of a well-known one. The value is a URL where users can find the CA certificate to install.

### giantswarm.io/helmcharts

This annotation is used on component entities to find related deployments (App or HelmRelease resources) in Kubernetes clusters. The value is a comma-separated list of helm chart references in the format `registry/repository/chart-name`.

### giantswarm.io/helmchart-versions

The helm chart version(s) of the latest release of a component entity. When the entity has multiple charts, versions are comma-separated and correspond to the charts listed in `giantswarm.io/helmcharts`.

### giantswarm.io/helmchart-app-versions

The application version(s) packaged in the helm chart(s) of a component entity. When the entity has multiple charts, versions are comma-separated and correspond to the charts listed in `giantswarm.io/helmcharts`.

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

Can be set manually, or populated automatically by the `LatestReleaseProcessor` (see `giantswarm.io/release-tag-prefix` and `github.com/project-slug`).

### giantswarm.io/latest-release-tag

The version tag of the latest release (as in a revision control system) of a component entity.

Can be set manually, or populated automatically by the `LatestReleaseProcessor` (see `giantswarm.io/release-tag-prefix` and `github.com/project-slug`).

### giantswarm.io/release-tag-prefix

Used on component entities that map to a subproject of a monorepo whose releases are tagged with a per-subproject prefix (for example `sre/v0.1.5`). When set together with `github.com/project-slug`, the `LatestReleaseProcessor` paginates the repository's GitHub releases and picks the most recent non-draft release whose `tag_name` starts with this prefix, then writes the resulting tag and date into `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date`.

When the annotation is absent, the processor falls back to GitHub's canonical `/releases/latest` endpoint (newest non-draft, non-prerelease release across the whole repository).

### github.com/project-slug

See [upstream documentation](https://backstage.io/docs/features/software-catalog/well-known-annotations/#githubcomproject-slug).

This annotation is needed to enable several features linked to the GitHub repository of the component entity, like a link to the source code repo, displaying GitHub pull request, and GitHub action runs.

## Labels

### giantswarm.io/app-build-suite-version

The app-build-suite version that builds the component's charts, e.g. `2.5.1`. It is not chosen by the repository: the architect orb's `push-to-app-catalog` job runs on the orb's `app-build-suite` executor, so the version follows from the orb release in `giantswarm.io/architect-orb-version`. Only set for components that run `push-to-app-catalog`.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/app-build-suite-status

Why a component that runs, or may run, `push-to-app-catalog` has no `giantswarm.io/app-build-suite-version` label. The only value is `unknown`: the orb ref is not a release, the orb source could not be read, or the CircleCI configuration could not be read in full, so whether the job runs is not known.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/app-deployment-action

Used on Template entities to identify scaffolder templates for app deployment actions. The portal discovers these templates by label instead of by name, so template names and namespaces can vary across environments. Supported values are `create` (for creating new app deployments) and `edit` (for editing existing ones).

### giantswarm.io/app-test-suite-version

The app-test-suite version the component's `run-tests-with-ats` job uses, e.g. `1.0.3`. `giantswarm.io/app-test-suite-version-source` says whether the repository sets it or relies on the architect orb's default. Only set for components that run `run-tests-with-ats`.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/app-test-suite-status

Why a component that runs, or may run, `run-tests-with-ats` has no `giantswarm.io/app-test-suite-version` label:

- `conflict`: the component would run more than one app-test-suite version, for example two jobs with different container tags, or one with a tag next to one on the orb default.
- `unknown`: the version could not be determined. The tag is a CircleCI template expression such as `<< parameters.ats_version >>`; or the repository relies on the orb default, but the orb ref is not a release or the orb release defines no default (releases before v5) or could not be read; or the CircleCI configuration could not be read in full, so whether the job runs is not known.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/architect-orb-version

The release of the `giantswarm/architect` CircleCI orb the component's CircleCI configuration uses, e.g. `10.11.1` (a leading `v` in the reference is dropped). Read from `.circleci/config.yml`, and for devctl-generated dynamic configuration also from `.circleci/workflows.yml` and `.circleci/custom.yml`. Only set for a release reference.

Set by the catalog importer on component entities in Giant Swarm's internal developer portal only. This label and the other build toolchain metadata (`giantswarm.io/app-build-suite-*`, `giantswarm.io/app-test-suite-*`, `giantswarm.io/architect-orb-*`) say what the repository's default branch declares it builds with, not what the last build ran: an orb bump after the last green build changes the label, not history. Versions are labels so the catalog can filter on them; each `*-status` label is set only where the tool is used, or may be used, but its version label could not be set.

### giantswarm.io/architect-orb-status

Why a component has no `giantswarm.io/architect-orb-version` label although it uses, or may use, the architect orb:

- `non-release`: the orb is referenced by a non-release ref, published in the `giantswarm.io/architect-orb-ref` annotation.
- `unknown`: the CircleCI configuration could not be read in full, for example a setup workflow that generates its continuation at pipeline time.

Build toolchain metadata, see `giantswarm.io/architect-orb-version`.

### giantswarm.io/customer

Name of the Giant Swarm customer an entity is associated with. This is only supposed to be used in Giant Swarm's internal developer portal.

### giantswarm.io/pipeline

Distinguishes between several types of installation resources. Values like `stable`, `ephemeral`, `testing` and more are possible.

### giantswarm.io/provider

Name of the infrastructure provider backing a Giant Swarm installation. Values are e. g. `aws`, `azure` etc.

### giantswarm.io/region

Name of the cloud provider region or data center location a Giant Swarm installation is running in. E. g. `cn-northwest-1`.
