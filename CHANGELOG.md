# Changelog

All notable changes to this project will be documented in this file.
Package specific changes (for packages from `packages/*` and `plugins/*`) can be found in a corresponding `CHANGELOG.md`.

## [Unreleased]

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

[Unreleased]: https://github.com/giantswarm/backstage/compare/v0.40.0...HEAD
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
