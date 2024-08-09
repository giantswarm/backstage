# Configuration

## Optional features

Some optional features can be enabled and disabled via the app configuration. For example, the configuration snippet above will enable the `installationsPage` feature:

```yaml
gs:
  features:
    installationsPage:
      enabled: true
```

The following optional features are available:

- `clustersPage`: Enable the Clusters page, which lists all clusters -- both management and workload clusters -- in the installations the user has access to via the Backstage instance.
- `installationsPage`: Enable the Installations page, which lists all Resource entities of type _instalation_ in the catalog.
- `opsgenie`: Enables the Opsgenie page, showing statistical data about the alerts in Opsgenie.
- `scaffolder`: Enables the scaffolder that lists available templates.
