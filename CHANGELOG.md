# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- The catalog now shows *owned* components by default again instead of *all*.

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

- The catalog now shows all components by default, instead of only the owned ones. To only see you team's components, click the *Owned*  filter.

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

- Display a repo's root *.md files content as techdocs alongside with the content from root docs folder.
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


[Unreleased]: https://github.com/giantswarm/backstage/compare/v0.12.1...HEAD
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
