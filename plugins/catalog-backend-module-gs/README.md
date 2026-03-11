# @giantswarm/backstage-plugin-catalog-backend-module-gs

The GS backend module for the catalog plugin.

This module provides:

- `GiantSwarmLocationProcessor` - a catalog processor that handles the `giantswarm` location type. It reads catalog entities from the target URL and assigns the `giantswarm` namespace to entities that don't already have an explicit namespace. This allows customer Backstage instances to separate GS-sourced entities from their own without modifying the source YAML files.

## Usage

Use the `giantswarm` location type in `catalog.locations` for GS-sourced catalog entries:

```yaml
catalog:
  locations:
    # GS-sourced entities get "giantswarm" namespace
    - type: giantswarm
      target: https://github.com/giantswarm/backstage-catalogs/blob/main/catalogs/*.yaml
    - type: giantswarm
      target: https://github.com/giantswarm/backstage-catalogs/blob/main/catalog/templates/app-deployment/template.yaml
```

- Entities with an explicit `metadata.namespace` are not modified.
- Glob patterns (e.g. `*.yaml`) are supported in target URLs.
