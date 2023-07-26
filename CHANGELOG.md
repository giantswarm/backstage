# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

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


[Unreleased]: https://github.com/giantswarm/backstage/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/giantswarm/backstage/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/giantswarm/backstage/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/giantswarm/backstage/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/giantswarm/backstage/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/giantswarm/backstage/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/giantswarm/backstage/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/giantswarm/backstage/tag/v0.1.0
