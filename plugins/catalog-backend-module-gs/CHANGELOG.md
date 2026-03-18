# @giantswarm/backstage-plugin-catalog-backend-module-gs

## 0.2.1

### Patch Changes

- 7bcefbc: Fix scaffolder template fetch failing for entities registered via `giantswarm` location type by emitting `url` as the entity location type instead of `giantswarm`.

## 0.2.0

### Minor Changes

- 8d3e632: Add GiantSwarmLocationProcessor to handle "giantswarm" catalog location type, assigning the giantswarm namespace to entities from GS-sourced locations.

## 0.1.0

### Minor Changes

- Initial release. Add DefaultNamespaceProcessor that assigns a configurable namespace to catalog entities based on their source location URL.
