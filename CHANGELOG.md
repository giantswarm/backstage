# Changelog

All notable changes to this project will be documented in this file.
Package specific changes (for packages from `packages/*` and `plugins/*`) can be found in a corresponding `CHANGELOG.md`.

## [Unreleased]

## [0.77.0] - 2025-06-11

See [./docs/releases/v0.77.0-changelog.md](./docs/releases/v0.77.0-changelog.md) for more information.

## [0.76.1] - 2025-06-11

In this release, source reference namespace for Kustomization objects has been fixed.

See [./docs/releases/v0.76.1-changelog.md](./docs/releases/v0.76.1-changelog.md) for more information.

## [0.76.0] - 2025-06-03

In this release, configurable links have been added to the home page and cluster details page.

See [./docs/releases/v0.76.0-changelog.md](./docs/releases/v0.76.0-changelog.md) for more information.

## [0.75.0] - 2025-06-02

In this release:

- The use case where there is only one installation connected is handled by hiding the installations selector.
- The use case where there is only one provider available is handled by hiding the provider filter.

See [./docs/releases/v0.75.0-changelog.md](./docs/releases/v0.75.0-changelog.md) for more information.

## [0.74.1] - 2025-05-29

In this release, `useInstallations` hook was refactored to store data in the context.

See [./docs/releases/v0.74.1-changelog.md](./docs/releases/v0.74.1-changelog.md) for more information.

## [0.74.0] - 2025-05-29

In this release:

- `GSContext` component has been moved above in the components tree so it can be shared between components;
- errors handling in the UI has been refactored;
- custom scaffolder fields have been refactored.

See [./docs/releases/v0.74.0-changelog.md](./docs/releases/v0.74.0-changelog.md) for more information.

## [0.73.3] - 2025-05-28

In this release, installations status check has been improved.

See [./docs/releases/v0.73.3-changelog.md](./docs/releases/v0.73.3-changelog.md) for more information.

## [0.73.2] - 2025-05-28

In this release:

- timeout for scaffolder API requests has been added;
- disabled installations check logic has been refactored.

See [./docs/releases/v0.73.2-changelog.md](./docs/releases/v0.73.2-changelog.md) for more information.

## [0.73.1] - 2025-05-26

In this release:

- installations picker has been changed to use Autocomplete component;
- validation function has been added for the installations picker scaffolder field.

See [./docs/releases/v0.73.1-changelog.md](./docs/releases/v0.73.1-changelog.md) for more information.

## [0.73.0] - 2025-05-22

In this release, logic to check availability status of connected installations was added.

See [./docs/releases/v0.73.0-changelog.md](./docs/releases/v0.73.0-changelog.md) for more information.

## [0.72.7] - 2025-05-21

In this release, custom scaffolder API client code has been refactored.

See [./docs/releases/v0.72.7-changelog.md](./docs/releases/v0.72.7-changelog.md) for more information.

## [0.72.6] - 2025-05-21

This release fixed an issue in custom scaffolder client that caused the cient to fail when some GS installations are unreachable.

See [./docs/releases/v0.72.6-changelog.md](./docs/releases/v0.72.6-changelog.md) for more information.

## [0.72.5] - 2025-05-21

This release fixed an issue in custom scaffolder client that caused the cient to fail when some GS installations are unreachable.

See [./docs/releases/v0.72.5-changelog.md](./docs/releases/v0.72.5-changelog.md) for more information.

## [0.72.4] - 2025-05-21

In this release, ReleasePicker scaffolder field has been improved to allow to filter releases by provider.

See [./docs/releases/v0.72.4-changelog.md](./docs/releases/v0.72.4-changelog.md) for more information.

## [0.72.3] - 2025-05-20

In this release, custom OIDC provider implementation was removed from GS auth backend module.

See [./docs/releases/v0.72.3-changelog.md](./docs/releases/v0.72.3-changelog.md) for more information.

## [0.72.2] - 2025-05-15

In this release fixed an incorrect secret reference in Helm chart templates.

See [./docs/releases/v0.72.2-changelog.md](./docs/releases/v0.72.2-changelog.md) for more information.

## [0.72.1] - 2025-05-14

In this release, Helm chart templates have been cleaned up.

See [./docs/releases/v0.72.1-changelog.md](./docs/releases/v0.72.1-changelog.md) for more information.

## [0.72.0] - 2025-05-14

In this release:

- headless backend package has been added to serve auth and scaffolder plugins separately from the main backend instance;
- custom discovery and scaffolder API clients have been added to interact with the headless backend instances.

See [./docs/releases/v0.72.0-changelog.md](./docs/releases/v0.72.0-changelog.md) for more information.

## [0.71.0] - 2025-04-30

In this release:

- Cloud Director support was added;
- GS auth backend module was changed to use `fetch` method from `node-fetch` package.

See [./docs/releases/v0.71.0-changelog.md](./docs/releases/v0.71.0-changelog.md) for more information.

## [0.70.0] - 2025-04-29

In this release, custom Kubernetes client was improved. Now it delegates unimplemented methods to the standard Kubernetes backend client.

See [./docs/releases/v0.70.0-changelog.md](./docs/releases/v0.70.0-changelog.md) for more information.

## [0.69.0] - 2025-04-28

In this release, custom GitHub auth provider was removed.

See [./docs/releases/v0.69.0-changelog.md](./docs/releases/v0.69.0-changelog.md) for more information.

## [0.68.0] - 2025-04-24

In this release:

- Backstage was updated to v1.38.1;
- other dependencies were updated.

See [./docs/releases/v0.68.0-changelog.md](./docs/releases/v0.68.0-changelog.md) for more information.

## [0.67.0] - 2025-04-24

In this release, column selection in deployments and clusters tables was improved to be persisted in local storage.

See [./docs/releases/v0.67.0-changelog.md](./docs/releases/v0.67.0-changelog.md) for more information.

## [0.66.0] - 2025-04-17

In this release, deployments table was changed to display aggregated statuses for deployments.

See [./docs/releases/v0.66.0-changelog.md](./docs/releases/v0.66.0-changelog.md) for more information.

## [0.65.0] - 2025-04-17

In this release:

- Ingress annotations have been made configurable in the Helm chart;
- `hostnames` configuration has been moved to `ingress.hostnames`;
- Sentry configuration on the backend has been fixed.

See [./docs/releases/v0.65.0-changelog.md](./docs/releases/v0.65.0-changelog.md) for more information.

## [0.64.3] - 2025-04-17

In this release, a rule to Sentry configuration was added to ignore TechDocs warnings.

See [./docs/releases/v0.64.3-changelog.md](./docs/releases/v0.64.3-changelog.md) for more information.

## [0.64.2] - 2025-04-16

In this release, cluster details page component was refactored to simplify the rendering flow.

See [./docs/releases/v0.64.2-changelog.md](./docs/releases/v0.64.2-changelog.md) for more information.

## [0.64.1] - 2025-04-16

In this release:

- custom scaffolder actions were replaced with the `@devangelista/backstage-scaffolder-kubernetes` plugin;
- the bug where the cluster details page may be displayed as blank was fixed.

See [./docs/releases/v0.64.1-changelog.md](./docs/releases/v0.64.1-changelog.md) for more information.

## [0.64.0] - 2025-04-15

In this release:

- Dex sign-in resolver was changed to use username from an email as user reference;
- `gitopsRepositories` configuration was changed to support GitHub repositories by default.

See [./docs/releases/v0.64.0-changelog.md](./docs/releases/v0.64.0-changelog.md) for more information.

## [0.63.1] - 2025-04-10

In this release, a bug that caused the InstallationsPicker component to incorrectly save selected installations into local storage was fixed.

See [./docs/releases/v0.63.1-changelog.md](./docs/releases/v0.63.1-changelog.md) for more information.

## [0.63.0] - 2025-04-10

In this release:

- GitOps indicator was added to the Deployment details pane;
- linkage between deployments and catalog entities was fixed.

See [./docs/releases/v0.63.0-changelog.md](./docs/releases/v0.63.0-changelog.md) for more information.

## [0.62.0] - 2025-04-09

In this release:

- error messages styles in deployment details were improved;
- resource entity page layout was improved.

See [./docs/releases/v0.62.0-changelog.md](./docs/releases/v0.62.0-changelog.md) for more information.

## [0.61.0] - 2025-04-09

In this release, links from deployments to corresponding catalog entities were added.

See [./docs/releases/v0.61.0-changelog.md](./docs/releases/v0.61.0-changelog.md) for more information.

## [0.60.0] - 2025-04-08

In this release:

- when no installations are selected, all are being fetched;
- several UI improvements were introduced;

See [./docs/releases/v0.60.0-changelog.md](./docs/releases/v0.60.0-changelog.md) for more information.

## [0.59.0] - 2025-04-03

In this release:

- developer portal roadmap link was added to home page;
- configurable Slack support channel link was added to home page;
- "loading" and "error" states were added to the OrganizationPicker and ReleasePicker scaffolder fields;
- region and pipeline information was added to the Installations picker;
- ability to use current user name in the TemplateStringInput scaffolder field was added.

See [./docs/releases/v0.59.0-changelog.md](./docs/releases/v0.59.0-changelog.md) for more information.

## [0.58.0] - 2025-03-27

In this release:

- "InstallationPicker", "OrganizationPicker", "ReleasePicker" custom scaffolder fields were added;
- custom scaffolder action that allows to apply manifests to a Kubernetes cluster was added.

See [./docs/releases/v0.58.0-changelog.md](./docs/releases/v0.58.0-changelog.md) for more information.

## [0.57.2] - 2025-03-26

See [./docs/releases/v0.57.2-changelog.md](./docs/releases/v0.57.2-changelog.md) for more information.

## [0.57.1] - 2025-03-25

In this release:

The following filters were added to the Deployments page:

- "Status";
- "Label".

The following filters were added to the Clusters page:

- "Release";
- "App version";
- "Kubernetes version";
- "Region";
- "Status";
- "Provider";
- "Label".

The "codename" field was removed from the Installation details page.

See [./docs/releases/v0.57.1-changelog.md](./docs/releases/v0.57.1-changelog.md) for more information.

## [0.57.0] - 2025-03-24

In this release, Backstage was updated to v1.37.0.

See [./docs/releases/v0.57.0-changelog.md](./docs/releases/v0.57.0-changelog.md) for more information.

## [0.56.3] - 2025-03-21

See [./docs/releases/v0.56.3-changelog.md](./docs/releases/v0.56.3-changelog.md) for more information.

## [0.56.2] - 2025-03-20

In this release:

- "Version" filter was added to the Deployments page;
- "Cluster type" filter was added to the Deployments page;
- "Namespace" filter was added to the Deployments page.

See [./docs/releases/v0.56.2-changelog.md](./docs/releases/v0.56.2-changelog.md) for more information.

## [0.56.1] - 2025-03-20

In this release:

- "Clusters" filter was added to the Deployments page;
- "Organizations" filter was added to the Clusters page.

See [./docs/releases/v0.56.1-changelog.md](./docs/releases/v0.56.1-changelog.md) for more information.

## [0.56.0] - 2025-03-19

In this release:

- filtering logic was added to the Deployments and Clusters pages;
- "Deployment Type" filter was added to the Deployments page;
- "Type" filter was added to the Clusters page;
- "MultipleSelect" component styles were improved to provide a more compact view;
- a counter for table items was added to the table titles.

See [./docs/releases/v0.56.0-changelog.md](./docs/releases/v0.56.0-changelog.md) for more information.

## [0.55.0] - 2025-03-18

In this release, layout of deployments and clusters pages was changed. Now it allows to add filters for a table.

See [./docs/releases/v0.55.0-changelog.md](./docs/releases/v0.55.0-changelog.md) for more information.

## [0.54.1] - 2025-03-13

This release fixes the sorting behavior for version columns by changing alphanumeric sorting to semver-aware sorting.

See [./docs/releases/v0.54.1-changelog.md](./docs/releases/v0.54.1-changelog.md) for more information.

## [0.54.0] - 2025-02-25

In this release:

- Custom CA information was added to installation details page.
- Non-standard access documentation was added to installation details page.
- GitOps indicator on cluster details page was refactored to be configurable via app configuration.

See [./docs/releases/v0.54.0-changelog.md](./docs/releases/v0.54.0-changelog.md) for more information.

## [0.53.0] - 2025-02-24

In this release:

- Backstage was updated to v1.36.1.
- Update other dependencies.
- Enable default auth policy.

GS plugins changes:

- Refactored how GS Kubernetes API is used.
- Refactored data fetching hooks to share common logic.

See [./docs/releases/v0.53.0-changelog.md](./docs/releases/v0.53.0-changelog.md) for more information.

## [0.52.0] - 2025-02-07

In this release:

- "Managed through GitOps" indicator was added to cluster details page.

See [./docs/releases/v0.52.0-changelog.md](./docs/releases/v0.52.0-changelog.md) for more information.

## [0.51.1] - 2025-02-05

In this release:

Deployments table improvements:

- page size was changed to 50 items. Allowed for a user to change page size to 100 items;
- sort by name by default;
- CLUSTER TYPE column values were fixed for App CRs deployed by a bundle.

Grafana link on cluster details page was changed to point to the new Cluster Overview Dashboard.

See [./docs/releases/v0.51.1-changelog.md](./docs/releases/v0.51.1-changelog.md) for more information.

## [0.51.0] - 2025-02-04

In this release:

- Deployments page with overview of all apps deployed throughout clusters was added.

Deployments list changes:

- Information in SOURCE column was changed. Now it shows type of source and source name. Information about chart name was moved to a separate column called CHART NAME;
- NAMESPACE/NAME column was split into two separate columns;
- CLUSTER column was changed. Missing cluster names are being correctly filled and values are displayed as links to cluster details pages;
- CLUSTER TYPE column was added to deployments list.

Clusters list changes:

- AWS ACCOUNT ID column was fixed to display values in groups of four digits.

See [./docs/releases/v0.51.0-changelog.md](./docs/releases/v0.51.0-changelog.md) for more information.

## [0.50.0] - 2025-01-29

In this release:

- KUBERNETES VERSION column was added to clusters list;
- AWS ACCOUNT ID column in clusters list was changed to display value with color hashing and link to AWS account;
- CLUSTER APP column in clusters list was changed to display provider specific cluster app version.

See [./docs/releases/v0.50.0-changelog.md](./docs/releases/v0.50.0-changelog.md) for more information.

## [0.49.2] - 2025-01-28

This release fixes fetching of unsupported infrastructure cluster identity resources.

See [./docs/releases/v0.49.2-changelog.md](./docs/releases/v0.49.2-changelog.md) for more information.

## [0.49.1] - 2025-01-28

This release fixes clusters fetching for unsupported providers.

See [./docs/releases/v0.49.1-changelog.md](./docs/releases/v0.49.1-changelog.md) for more information.

## [0.49.0] - 2025-01-28

In this release:

- `RELEASE` column was added to clusters list;
- `LOCATION` column was added to clusters list;
- `AWS ACCOUNT ID` column was added to clusters list.

See [./docs/releases/v0.49.0-changelog.md](./docs/releases/v0.49.0-changelog.md) for more information.

## [0.48.0] - 2025-01-23

In this release:

- `TYPE` column in clusters list view was changed to show management/workload cluster icon;
- `CLUSTER APP` column was added to clusters list.

See [./docs/releases/v0.48.0-changelog.md](./docs/releases/v0.48.0-changelog.md) for more information.

## [0.47.0] - 2025-01-16

In this release:

- configurable home page was added;
- on the cluster details page, information about the installation was moved from a dedicated widget into the About widget.

See [./docs/releases/v0.47.0-changelog.md](./docs/releases/v0.47.0-changelog.md) for more information.

## [0.46.0] - 2025-01-14

In this release:

- links to Grafana and Web UI were added to cluster details page;
- Backstage was updated to v1.34.2.

See [./docs/releases/v0.46.0-changelog.md](./docs/releases/v0.46.0-changelog.md) for more information.

## [0.45.5] - 2024-12-18

This release removes `undici` proxy configuration for Backstage backend.

See [./docs/releases/v0.45.5-changelog.md](./docs/releases/v0.45.5-changelog.md) for more information.

## [0.45.4] - 2024-12-17

This release allows to configure HTTP proxy for Backstage backend.

See [./docs/releases/v0.45.4-changelog.md](./docs/releases/v0.45.4-changelog.md) for more information.

## [0.45.3] - 2024-12-16

In this release:

- GS OIDC auth provider sign-in resolver was changed to correctly handle Azure AD identity provider;
- user reference used in telemetry signals now contains unique hash for guest users.

See [./docs/releases/v0.45.3-changelog.md](./docs/releases/v0.45.3-changelog.md) for more information.

## [0.45.2] - 2024-12-12

In this release GitHub app credentials were made optional. `BACKSTAGE_ENVIRONMENT` environment variable was removed.

## [0.45.1] - 2024-12-12

In this release `BACKEND_SECRET` environment variable was removed.

## [0.45.0] - 2024-12-11

This release changes main site authentication from GitHub to Dex.

See [./docs/releases/v0.45.0-changelog.md](./docs/releases/v0.45.0-changelog.md) for more information.

## [0.44.0] - 2024-12-10

This release adds a custom logger service that reports errors to Sentry to the backend package.

See [./docs/releases/v0.44.0-changelog.md](./docs/releases/v0.44.0-changelog.md) for more information.

## [0.43.0] - 2024-12-10

In this release:

- Backstage was updated to v1.33.5;
- Other project dependencies were updated.

See [./docs/releases/v0.43.0-changelog.md](./docs/releases/v0.43.0-changelog.md) for more information.

## [0.42.1] - 2024-11-19

In this release:

- Helm chart secrets were restructured;
- PSP support was removed;
- support for extra env vars and volumes was added.

## [0.42.0] - 2024-11-18

In this release:

- Backstage was updated to v1.32.5
- Custom Kubernetes and KubernetesAuthProviders APIs were added to communicate with Kubernetes clusters from client side.
- Custom GitHub auth provider was moved from GS backend module to backend package.

See [./docs/releases/v0.42.0-changelog.md](./docs/releases/v0.42.0-changelog.md) for more information.

## [0.41.3] - 2024-11-11

This release fixes a bug when Grafana links for component deployments had incorrect namespace variable.

See [./docs/releases/v0.41.3-changelog.md](./docs/releases/v0.41.3-changelog.md) for more information.

## [0.41.2] - 2024-11-11

See [./docs/releases/v0.41.2-changelog.md](./docs/releases/v0.41.2-changelog.md) for more information.

## [0.41.1] - 2024-11-04

This release fixes a bug when GS users were incorrectly distinguished from customer users.

See [./docs/releases/v0.41.1-changelog.md](./docs/releases/v0.41.1-changelog.md) for more information.

## [0.41.0] - 2024-10-31

In this release:

- Cluster details page was added.
- K8s resources management was refactored in GS plugins.
- Auto generation of TS types and constant values for K8s resources was added in GS plugins.

See [./docs/releases/v0.41.0-changelog.md](./docs/releases/v0.41.0-changelog.md) for more information.

## [0.40.0] - 2024-10-09

In this release:

- Usage tracking with TelemetryDeck was added.
- GS plugins were renamed in preparation to publish them.
- Backstage packages were updated to v1.31.3.

See [./docs/releases/v0.40.0-changelog.md](./docs/releases/v0.40.0-changelog.md) for more information.

## [0.39.2] - 2024-10-02

- Identical with 0.39.1. This release was made to ensure the release process works as expected.

## [0.39.1] - 2024-10-02

### Fixed

- Change installation provider label "VSphere vintage" to "VSphere".

## [0.39.0] - 2024-10-01

### Added

- GS plugin: Add Ingress link for deployments.

## [0.38.0] - 2024-09-30

### Removed

- Remove Opsgenie plugin.

## [0.37.2] - 2024-09-26

### Fixes

- GS plugin: Fix Grafana link application name.

## [0.37.1] - 2024-09-25

### Fixes

- GS plugin: Fix the error in the DeploymentDetailsPicker scaffolder field when pre-selected installation was missing in the form data.

### Changed

- Update dependencies.

## [0.37.0] - 2024-09-24

### Added

- GS plugin: Add Grafana dashboard link for deployments.

## [0.36.0] - 2024-09-20

### Changed

- GS plugin: Add option to hide provider config selectors in the DeploymentDetailsPicker scaffolder field.

## [0.35.3] - 2024-09-17

### Changed

- Update CSP (content security policy) for images.

## [0.35.2] - 2024-09-05

### Changed

- GS plugin: Kratix status card was improved to provide more information.

## [0.35.1] - 2024-09-04

### Added

- Add AWS credentials to environment variables.

## [0.35.0] - 2024-09-03

### Added

- Add AWS integration for catalog and scaffolder plugins.
- GS plugin: Display Kratix resources in the catalog.

## [0.34.1] - 2024-09-03

### Changed

- GS plugin: Expose organization of the selected cluster in the DeploymentDetailsPicker scaffolder field.

## [0.34.0] - 2024-08-30

### Changed

- Update Backstage to 1.30.4.

## [0.33.2] - 2024-08-29

### Removed

- Page "Installations" is now visible to all dev portal visitors, feature flag `show-installations-page` is removed.

## [0.33.1] - 2024-08-21

### Removed

- Container images are no longer pushed to our Aliyun registry.

## [0.33.0] - 2024-08-21

### Added

- GS plugin: Add scaffolder custom step layout.

### Changed

- Preselect installation if only one is available in the DeploymentDetailsPicker scaffolder field.
- Switch provider config dropdowns in the DeploymentDetailsPicker scaffolder field.

## [0.32.1] - 2024-08-09

### Changed

- Installations:
  - Enable search for custom columns of index table.
  - Use place icon instead of Giant Swarm logo for in main menu.
  - Set page header to "Installations".
  - Add "Base domain" and "Account engineer" field to entity page.
  - Add "Base domain" and "Account engineer" field to index table.
  - Remove "Source" field from entity page, to use generic "View source" link instead.

### Added

- Add custom entity link icons "giantswarm" and "grafana".

## [0.32.0] - 2024-08-06

### Added

- Add experimental "Installations" page, visible with feature flag `show-installations-page`.
- GS plugin: Add scaffolder custom field extension for picking deployment details.
- GS plugin: Add scaffolder custom field extension for picking secret stores.
- Add catalog GitHub integration.

## [0.31.0] - 2024-07-30

### Changed

- Update Backstage to 1.29.2.
- Update liveness and readiness probes to use default endpoints.

### Added

- Use new Catalog Logs module.

### Removed

- Remove /healthcheck endpoint.

## [0.30.0] - 2024-07-25

### Added

- Enable scaffolder backend modules (GitHub and GS).
- GS plugin: Add scaffolder custom field extension that allows to template initial value for a string field.

## [0.29.0] - 2024-07-09

### Removed

- Remove Flux plugin and related feature flags.
- Remove link to GitOps UI for deployments.

## [0.28.0] - 2024-07-08

### Added

- GS plugin: Add `<GSFeatureEnabled />` component to hide some UI features based on the app-config.

## [0.27.0] - 2024-07-04

### Changed

- Update Backstage to 1.28.4.

## [0.26.0] - 2024-07-01

### Added

- Add `plugin-scaffolder-backend-module-gs` backend module with custom `parseClusterRef` filter for scaffolder plugin.
- GS Auth: add custom sign-in resolver for GitHub auth provider.

### Removed

- Clean up catalog templates.

## [0.25.0] - 2024-06-20

### Added

- GS plugin: Add scaffolder custom field extension for picking a workload cluster.

### Changed

- GS plugin: Allow to select only one installation in the InstallationsSelector component.
- GS plugin: Refactor useInstallationsStatuses hook so the state updates are debounced by 200ms.

## [0.24.0] - 2024-06-13

### Added

- GS plugin: Add "Cluster access" pane that explains cluster access in the cluster list.

### Removed

- Disable Report Issue addon for TechDocs plugin.

## [0.23.1] - 2024-06-06

### Fixes

- Delete empty configuration for GS plugin to pass validation.
- Add empty configurations for grafana and opsgenie plugins to pass validation.

## [0.23.0] - 2024-06-06

### Removed

- Delete devportal configuration.

## [0.22.2] - 2024-06-05

### Added

- Add Vertical Pod Autoscaler configuration to the Helm chart.

### Changed

- Update Backstage to 1.27.5.
- Delete app configuration for snail instance.
- Combine devportal development and production configurations.

## [0.22.1] - 2024-04-25

### Fixes

- GS Auth: Fix backend startup when some OIDC issuers are not available.

## [0.22.0] - 2024-04-25

### Changed

- GS plugin: Fetch clusters per organization a user has access to.

## [0.21.1] - 2024-04-25

### Changed

- Update Backstage to 1.26.4.
- Update dependencies.

## [0.21.0] - 2024-04-18

### Changed

- Update Backstage to 1.26.0.
- Move techdocs custom preparer to a separate backend module.

## [0.20.2] - 2024-04-08

### Changed

- Update dependencies.

## [0.20.1] - 2024-04-08

### Fixed

- Change the width of the catalog table columns so they evenly spread.
- Fix catalog table 'Latest release' column sorting.
- Fix catalog table 'Last released' column sorting.
- Disable 'unsorted' click for catalog table order buttons.

## [0.20.0] - 2024-04-04

### Added

- Show latest release version and age and helm chart details on catalog components.

### Changed

- Make CircleCI not to push to aliyun registry.

## [0.19.0] - 2024-04-02

### Added

- GS plugin: Add cluster details pane with basic information.

### Changed

- Update Backstage to 1.25.0.
- Move common types and functions into separate `plugin-gs-common` package.
- GS plugin: Refactor deployment details pane component so it can be reused in other places.

### Fixed

- Fix prettier configuration.

## [0.18.1] - 2024-03-27

### Fixed

- Configure backend secret for production environments.
- GS plugin: Remove unused installations configuration.

## [0.18.0] - 2024-03-26

### Changed

- Update Backstage to 1.24.2.
- Migrate backend to the new backend system.
- Move GS auth providers configuration to a separate backend module.

## [0.17.0] - 2024-03-20

### Added

- Add basic /healthcheck endpoint
- Add liveness and readiness probes checking for the /healthcheck endpoint

### Changed

- GS plugin: Display link to commit on GitHub for deployment dev versions.
- GS plugin: Change GitOps UI link text in the deployment details pane.
- GS plugin: Make HelmRelease conditions in the deployment details pane collapsed by default.
- GS plugin: Display source and updated timestamp in the deployment details pane.

### Fixed

- Add kubernetes plugin configuration to snail app-config.

## [0.16.3] - 2024-03-13

### Changed

- Change PodDisruptionBudget to allow moving of the single pod.

## [0.16.2] - 2024-03-13

### Changed

- Lower deployment resource requests and limits, make them configurable via chart values.

## [0.16.1] - 2024-03-05

### Fixed

- Fix GitHub Actions plugin.

## [0.16.0] - 2024-03-05

### Changed

- GS plugin: Align deployment status UIs in the table view and in the details pane.
- GS plugin: Add 'namespace', 'source' and 'updated' information to deployments list.
- GS plugin: Add deployments list visual improvements.

## [0.15.7] - 2024-03-01

### Fixed

- Fix helm chart by moving CI values outside the templates folder.

## [0.15.6] - 2024-03-01

### Fixed

- Fix CI configuration to create a public container image again.

## [0.15.5] - 2024-03-01

### Added

- Set the `backstage.io/kubernetes-id` label on rendered resources, for discovery in Backstage itself.

### Changed

- Use full width for the members list card.

## [0.15.4] - 2024-02-28

### Changed

- Hide Kubernetes plugin UI behind feature flag.
- Flux plugin: Hide plugin UIs behind feature flags.

## [0.15.3] - 2024-02-26

### Changed

- Upgrade backstage to v1.23.3
- GS plugin: Use Kubernetes plugin to access clusters' APIs.
- GS plugin: Add links to GitOps UI.
- Flux plugin: Add links to GitOps UI.

## [0.15.2] - 2024-02-20

### Changed

- Upgrade backstage to v1.23.0

## [0.15.1] - 2024-02-19

### Changed

- Enable running on K8s 1.25 with PSS
  - Only render PSP related resources if `.Values.global.podSecurityStandards.enforced` is not true.

## [0.15.0] - 2024-02-07

### Changed

- Limit renovate to 1 concurrent PR.
- Upgrade backstage to v1.22.2

### Added

- Add Flux plugin.

## [0.14.0] - 2024-01-16

### Changed

- GS plugin: Display additional information for clusters.
- GS plugin: Configure deployment names via catalog entity annotation.

## [0.13.0] - 2024-01-10

### Changed

- Move Deployments tab to the second position on the service entity page.

### Added

- GS plugin: Add deployment details pane.

### Fixed

- GS plugin: Fix deployments selection for entity deployments list.

## [0.12.2] - 2023-12-14

### Changed

- GS plugin: Use @tanstack/react-query for data fetching.

## [0.12.1] - 2023-12-13

### Changed

- Use new Azure CR instead of Docker Hub

## [0.12.0] - 2023-12-07

### Added

- Add deployments page for service catalog entities.

### Changed

- Enable Giant Swarm plugin for devportal.
- GS plugin: Persist selected installations in LocalStorage.

## [0.11.0] - 2023-11-30

### Added

- Add multiple installations access to the Giant Swarm plugin.

## [0.10.3] - 2023-11-21

### Changed

- Update Content Security Policy to fix worker-src error.
- Upgrade backstage to v1.20.3.

## [0.10.2] - 2023-11-16

### Changed

- Upgrade backstage to v1.20.1.

### Fixed

- Fix Content Security Policy to include fortawesome.com.

## [0.10.1] - 2023-11-15

### Changed

- Wording changes in the Giant Swarm plugin

### Fixed

- Make custom gs plugin configuration not required.
- Update Content Security Policy to include fortawesome.com.

## [0.10.0] - 2023-11-09

### Added

- Custom plugin was added that allows to list workload clusters on snail.
- OIDC authentication with Dex was added to get access to Giant Swarm MAPI.

### Changed

- Upgrade backstage to v1.18.4.

## [0.9.1] - 2023-09-27

### Changed

- Upgrade backstage to v1.18.3.

## [0.9.0] - 2023-09-25

### Added

- Add snail instance configuration files.

## [0.8.1] - 2023-09-22

### Added

- Push chart archive to control-plane app catalog.

## [0.8.0] - 2023-09-19

### Added

- Added Quay.io info on docker images.

### Changed

- Extended the development documentation and moved it into a separate file.

## [0.7.0] - 2023-09-14

### Changed

- Split up devportal specific configuration.

## [0.6.0] - 2023-09-14

### Added

- OpsGenie information regarding on-call and alerts is now shown in the context of entities and teams, as well as in an extra section.

### Changed

- Improve entity dependencies page.
- Update Backstage packages to v1.17.5.
- The catalog now shows _owned_ components by default again instead of _all_.

## [0.5.0] - 2023-08-22

### Changed

- Add Docs menu item.
- Read catalog data from URL location.

## [0.4.0] - 2023-08-21

- Change condition for when to show links. Now links can be shown for all entity kinds.
- Remove docs tab from entity page.
- Add list of Grafana dashboards owned by the team to Group entity page.

## [0.3.0] - 2023-08-18

- Show links for components of type service.

## [0.2.0] - 2023-08-14

### Changed

- The catalog now shows all components by default, instead of only the owned ones. To only see you team's components, click the _Owned_ filter.

## [0.1.16] - 2023-08-10

### Fixed

- Fix tracesSampleRate key name in config.

## [0.1.15] - 2023-08-10

### Fixed

- Make errorReporter in app-config optional.

## [0.1.14] - 2023-08-10

### Added

- Add Sentry error tracking.

## [0.1.13] - 2023-08-08

### Changed

- Add component type column.
- Hide component tags column.
- Adapt entity page for different component types.

## [0.1.12] - 2023-08-04

### Changed

- Update CSP (content security policy) for images.

### Removed

- Remove several unused items from the catalog entity details page: Links, Subcomponents.

## [0.1.11] - 2023-08-04

### Changed

- Display a repo's root \*.md files content as techdocs alongside with the content from root docs folder.
- Generate docs locally on production.

## [0.1.10] - 2023-08-01

### Changed

- Modify GitHub auth provider default scopes to prevent multiple sign in popups.

## [0.1.9] - 2023-07-28

### Changed

- Hide unused columns/actions in catalog table.
- Use auto width for catalog table columns.

## [0.1.8] - 2023-07-27

### Added

- Add custom catalog page.

### Changed

- Update Backstage packages to v1.16.0.

## [0.1.7] - 2023-07-26

### Added

- Set configuration for support button.
- Add possibility to specify nodeSelector for the deployment

### Removed

- Remove api-docs plugin.
- Remove `APIs`, `Docs`, `Create...` from main menu.

## [0.1.6] - 2023-07-25

### Changed

- Modify CSP for images

### Removed

- Remove oauth2-proxy.

## [0.1.5] - 2023-07-24

### Changed

- Use GitHub identity resolver.
- Delete catalog example data in favour of using [backstage-catalog-importer](https://github.com/giantswarm/backstage-catalog-importer) utility.

## [0.1.4] - 2023-07-21

## [0.1.3] - 2023-07-20

### Fixed

- Fix Helm values.yaml linter issue.
- Add securityContext into oauth2-proxy deployment.

## [0.1.2] - 2023-07-20

### Fixed

- Fix values.yaml linter issue

## [0.1.1] - 2023-07-20

### Added

- Add catalog configmap
- Add oauth2-proxy

## [0.1.0] - 2023-07-19

### Added

- Add CircleCI configuration.
- Add Helm chart.

### Changed

- Disable anonymous access.

[Unreleased]: https://github.com/giantswarm/backstage/compare/v0.77.0...HEAD
[0.77.0]: https://github.com/giantswarm/backstage/compare/v0.76.1...v0.77.0
[0.76.1]: https://github.com/giantswarm/backstage/compare/v0.76.0...v0.76.1
[0.76.0]: https://github.com/giantswarm/backstage/compare/v0.75.0...v0.76.0
[0.75.0]: https://github.com/giantswarm/backstage/compare/v0.74.1...v0.75.0
[0.74.1]: https://github.com/giantswarm/backstage/compare/v0.74.0...v0.74.1
[0.74.0]: https://github.com/giantswarm/backstage/compare/v0.73.3...v0.74.0
[0.73.3]: https://github.com/giantswarm/backstage/compare/v0.73.2...v0.73.3
[0.73.2]: https://github.com/giantswarm/backstage/compare/v0.73.1...v0.73.2
[0.73.1]: https://github.com/giantswarm/backstage/compare/v0.73.0...v0.73.1
[0.73.0]: https://github.com/giantswarm/backstage/compare/v0.72.7...v0.73.0
[0.72.7]: https://github.com/giantswarm/backstage/compare/v0.72.6...v0.72.7
[0.72.6]: https://github.com/giantswarm/backstage/compare/v0.72.5...v0.72.6
[0.72.5]: https://github.com/giantswarm/backstage/compare/v0.72.4...v0.72.5
[0.72.4]: https://github.com/giantswarm/backstage/compare/v0.72.3...v0.72.4
[0.72.3]: https://github.com/giantswarm/backstage/compare/v0.72.2...v0.72.3
[0.72.2]: https://github.com/giantswarm/backstage/compare/v0.72.1...v0.72.2
[0.72.1]: https://github.com/giantswarm/backstage/compare/v0.72.0...v0.72.1
[0.72.0]: https://github.com/giantswarm/backstage/compare/v0.71.0...v0.72.0
[0.71.0]: https://github.com/giantswarm/backstage/compare/v0.70.0...v0.71.0
[0.70.0]: https://github.com/giantswarm/backstage/compare/v0.69.0...v0.70.0
[0.69.0]: https://github.com/giantswarm/backstage/compare/v0.68.0...v0.69.0
[0.68.0]: https://github.com/giantswarm/backstage/compare/v0.67.0...v0.68.0
[0.67.0]: https://github.com/giantswarm/backstage/compare/v0.66.0...v0.67.0
[0.66.0]: https://github.com/giantswarm/backstage/compare/v0.65.0...v0.66.0
[0.65.0]: https://github.com/giantswarm/backstage/compare/v0.64.3...v0.65.0
[0.64.3]: https://github.com/giantswarm/backstage/compare/v0.64.2...v0.64.3
[0.64.2]: https://github.com/giantswarm/backstage/compare/v0.64.1...v0.64.2
[0.64.1]: https://github.com/giantswarm/backstage/compare/v0.64.0...v0.64.1
[0.64.0]: https://github.com/giantswarm/backstage/compare/v0.63.1...v0.64.0
[0.63.1]: https://github.com/giantswarm/backstage/compare/v0.63.0...v0.63.1
[0.63.0]: https://github.com/giantswarm/backstage/compare/v0.62.0...v0.63.0
[0.62.0]: https://github.com/giantswarm/backstage/compare/v0.61.0...v0.62.0
[0.61.0]: https://github.com/giantswarm/backstage/compare/v0.60.0...v0.61.0
[0.60.0]: https://github.com/giantswarm/backstage/compare/v0.59.0...v0.60.0
[0.59.0]: https://github.com/giantswarm/backstage/compare/v0.58.0...v0.59.0
[0.58.0]: https://github.com/giantswarm/backstage/compare/v0.57.2...v0.58.0
[0.57.2]: https://github.com/giantswarm/backstage/compare/v0.57.1...v0.57.2
[0.57.1]: https://github.com/giantswarm/backstage/compare/v0.57.0...v0.57.1
[0.57.0]: https://github.com/giantswarm/backstage/compare/v0.56.3...v0.57.0
[0.56.3]: https://github.com/giantswarm/backstage/compare/v0.56.2...v0.56.3
[0.56.2]: https://github.com/giantswarm/backstage/compare/v0.56.1...v0.56.2
[0.56.1]: https://github.com/giantswarm/backstage/compare/v0.56.0...v0.56.1
[0.56.0]: https://github.com/giantswarm/backstage/compare/v0.55.0...v0.56.0
[0.55.0]: https://github.com/giantswarm/backstage/compare/v0.54.1...v0.55.0
[0.54.1]: https://github.com/giantswarm/backstage/compare/v0.54.0...v0.54.1
[0.54.0]: https://github.com/giantswarm/backstage/compare/v0.53.0...v0.54.0
[0.53.0]: https://github.com/giantswarm/backstage/compare/v0.52.0...v0.53.0
[0.52.0]: https://github.com/giantswarm/backstage/compare/v0.51.1...v0.52.0
[0.51.1]: https://github.com/giantswarm/backstage/compare/v0.51.0...v0.51.1
[0.51.0]: https://github.com/giantswarm/backstage/compare/v0.50.0...v0.51.0
[0.50.0]: https://github.com/giantswarm/backstage/compare/v0.49.2...v0.50.0
[0.49.2]: https://github.com/giantswarm/backstage/compare/v0.49.1...v0.49.2
[0.49.1]: https://github.com/giantswarm/backstage/compare/v0.49.0...v0.49.1
[0.49.0]: https://github.com/giantswarm/backstage/compare/v0.48.0...v0.49.0
[0.48.0]: https://github.com/giantswarm/backstage/compare/v0.47.0...v0.48.0
[0.47.0]: https://github.com/giantswarm/backstage/compare/v0.46.0...v0.47.0
[0.46.0]: https://github.com/giantswarm/backstage/compare/v0.45.5...v0.46.0
[0.45.5]: https://github.com/giantswarm/backstage/compare/v0.45.4...v0.45.5
[0.45.4]: https://github.com/giantswarm/backstage/compare/v0.45.3...v0.45.4
[0.45.3]: https://github.com/giantswarm/backstage/compare/v0.45.2...v0.45.3
[0.45.2]: https://github.com/giantswarm/backstage/compare/v0.45.1...v0.45.2
[0.45.1]: https://github.com/giantswarm/backstage/compare/v0.45.0...v0.45.1
[0.45.0]: https://github.com/giantswarm/backstage/compare/v0.44.0...v0.45.0
[0.44.0]: https://github.com/giantswarm/backstage/compare/v0.43.0...v0.44.0
[0.43.0]: https://github.com/giantswarm/backstage/compare/v0.42.1...v0.43.0
[0.42.1]: https://github.com/giantswarm/backstage/compare/v0.42.0...v0.42.1
[0.42.0]: https://github.com/giantswarm/backstage/compare/v0.41.3...v0.42.0
[0.41.3]: https://github.com/giantswarm/backstage/compare/v0.41.2...v0.41.3
[0.41.2]: https://github.com/giantswarm/backstage/compare/v0.41.1...v0.41.2
[0.41.1]: https://github.com/giantswarm/backstage/compare/v0.41.0...v0.41.1
[0.41.0]: https://github.com/giantswarm/backstage/compare/v0.40.0...v0.41.0
[0.40.0]: https://github.com/giantswarm/backstage/compare/v0.39.2...v0.40.0
[0.39.2]: https://github.com/giantswarm/backstage/compare/v0.39.1...v0.39.2
[0.39.1]: https://github.com/giantswarm/backstage/compare/v0.39.0...v0.39.1
[0.39.0]: https://github.com/giantswarm/backstage/compare/v0.38.0...v0.39.0
[0.38.0]: https://github.com/giantswarm/backstage/compare/v0.37.2...v0.38.0
[0.37.2]: https://github.com/giantswarm/backstage/compare/v0.37.1...v0.37.2
[0.37.1]: https://github.com/giantswarm/backstage/compare/v0.37.0...v0.37.1
[0.37.0]: https://github.com/giantswarm/backstage/compare/v0.36.0...v0.37.0
[0.36.0]: https://github.com/giantswarm/backstage/compare/v0.35.3...v0.36.0
[0.35.3]: https://github.com/giantswarm/backstage/compare/v0.35.2...v0.35.3
[0.35.2]: https://github.com/giantswarm/backstage/compare/v0.35.1...v0.35.2
[0.35.1]: https://github.com/giantswarm/backstage/compare/v0.35.0...v0.35.1
[0.35.0]: https://github.com/giantswarm/backstage/compare/v0.34.1...v0.35.0
[0.34.1]: https://github.com/giantswarm/backstage/compare/v0.34.0...v0.34.1
[0.34.0]: https://github.com/giantswarm/backstage/compare/v0.33.2...v0.34.0
[0.33.2]: https://github.com/giantswarm/backstage/compare/v0.33.1...v0.33.2
[0.33.1]: https://github.com/giantswarm/backstage/compare/v0.33.0...v0.33.1
[0.33.0]: https://github.com/giantswarm/backstage/compare/v0.32.1...v0.33.0
[0.32.1]: https://github.com/giantswarm/backstage/compare/v0.32.0...v0.32.1
[0.32.0]: https://github.com/giantswarm/backstage/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/giantswarm/backstage/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/giantswarm/backstage/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/giantswarm/backstage/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/giantswarm/backstage/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/giantswarm/backstage/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/giantswarm/backstage/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/giantswarm/backstage/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/giantswarm/backstage/compare/v0.23.1...v0.24.0
[0.23.1]: https://github.com/giantswarm/backstage/compare/v0.23.0...v0.23.1
[0.23.0]: https://github.com/giantswarm/backstage/compare/v0.22.2...v0.23.0
[0.22.2]: https://github.com/giantswarm/backstage/compare/v0.22.1...v0.22.2
[0.22.1]: https://github.com/giantswarm/backstage/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/giantswarm/backstage/compare/v0.21.1...v0.22.0
[0.21.1]: https://github.com/giantswarm/backstage/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/giantswarm/backstage/compare/v0.20.2...v0.21.0
[0.20.2]: https://github.com/giantswarm/backstage/compare/v0.20.1...v0.20.2
[0.20.1]: https://github.com/giantswarm/backstage/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/giantswarm/backstage/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/giantswarm/backstage/compare/v0.18.1...v0.19.0
[0.18.1]: https://github.com/giantswarm/backstage/compare/v0.18.0...v0.18.1
[0.18.0]: https://github.com/giantswarm/backstage/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/giantswarm/backstage/compare/v0.16.3...v0.17.0
[0.16.3]: https://github.com/giantswarm/backstage/compare/v0.16.2...v0.16.3
[0.16.2]: https://github.com/giantswarm/backstage/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/giantswarm/backstage/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/giantswarm/backstage/compare/v0.15.7...v0.16.0
[0.15.7]: https://github.com/giantswarm/backstage/compare/v0.15.6...v0.15.7
[0.15.6]: https://github.com/giantswarm/backstage/compare/v0.15.5...v0.15.6
[0.15.5]: https://github.com/giantswarm/backstage/compare/v0.15.4...v0.15.5
[0.15.4]: https://github.com/giantswarm/backstage/compare/v0.15.3...v0.15.4
[0.15.3]: https://github.com/giantswarm/backstage/compare/v0.15.2...v0.15.3
[0.15.2]: https://github.com/giantswarm/backstage/compare/v0.15.1...v0.15.2
[0.15.1]: https://github.com/giantswarm/backstage/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/giantswarm/backstage/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/giantswarm/backstage/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/giantswarm/backstage/compare/v0.12.2...v0.13.0
[0.12.2]: https://github.com/giantswarm/backstage/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/giantswarm/backstage/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/giantswarm/backstage/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/giantswarm/backstage/compare/v0.10.3...v0.11.0
[0.10.3]: https://github.com/giantswarm/backstage/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/giantswarm/backstage/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/giantswarm/backstage/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/giantswarm/backstage/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/giantswarm/backstage/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/giantswarm/backstage/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/giantswarm/backstage/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/giantswarm/backstage/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/giantswarm/backstage/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/giantswarm/backstage/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/giantswarm/backstage/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/giantswarm/backstage/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/giantswarm/backstage/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/giantswarm/backstage/compare/v0.1.16...v0.2.0
[0.1.16]: https://github.com/giantswarm/backstage/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/giantswarm/backstage/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/giantswarm/backstage/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/giantswarm/backstage/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/giantswarm/backstage/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/giantswarm/backstage/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/giantswarm/backstage/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/giantswarm/backstage/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/giantswarm/backstage/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/giantswarm/backstage/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/giantswarm/backstage/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/giantswarm/backstage/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/giantswarm/backstage/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/giantswarm/backstage/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/giantswarm/backstage/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/giantswarm/backstage/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/giantswarm/backstage/tag/v0.1.0
