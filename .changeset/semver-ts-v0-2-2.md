---
'@giantswarm/backstage-plugin-gs': patch
---

A deployment's automatic upgrades are read from semver ranges exactly as Flux reads them, for three more range shapes. A range with a bare wildcard behind an operator (`>*`, `!=*`) keeps its operator. A caret range with a wildcard or missing part (`^1`, `^1.2.x`) no longer admits a pre-release of its base version. A hyphen range with a wildcard end (`1.2.x - 1.4`, `* - 1.0`) is read as a range.
