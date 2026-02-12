# Configuration

## Cluster details page resources

The cluster details page allows you to configure resource links that will be displayed in place of the default links.

### Configuration example

Below is an example configuration for overriding the default links on the cluster details page:

```yaml
gs:
  clusterDetails:
    resources:
      - label: 'Alerts'
        icon: 'NotificationsNone'
        url: 'https://grafana.${{BASE_DOMAIN}}/alerting'
      - label: 'Web UI'
        icon: 'Public'
        url: 'https://happa.${{BASE_DOMAIN}}/organizations/${{ORG_NAME}}/clusters/${{CLUSTER_NAME}}'
        clusterType: 'workload'
      - label: 'Web UI'
        icon: 'Public'
        url: 'https://happa.${{BASE_DOMAIN}}'
        clusterType: 'management'
```

### Cluster type specific links

If the `clusterType` configuration option is not set, the link will be displayed for both management and workload clusters.
If the `clusterType` is set to `management`, the link will be displayed only for management clusters.
If the `clusterType` is set to `workload`, the link will be displayed only for workload clusters.

### URL Templating

The `url` parameter supports templating with the following placeholders:

- `CLUSTER_NAME` - name of the cluster.
- `CLUSTER_NAMESPACE` - namespace of the cluster.
- `MC_NAME` - name of the management cluster.
- `ORG_NAME` - name of the organization.
- `BASE_DOMAIN` - base domain of the management cluster.

For example, the URL `https://happa.${{BASE_DOMAIN}}/organizations/${{ORG_NAME}}/clusters/${{CLUSTER_NAME}}` will be dynamically populated with the appropriate values.

### Icon Configuration

The icon parameter can be:

- A custom icon name from the list of [supported icons](https://github.com/giantswarm/backstage/blob/main/plugins/gs/src/assets/icons/CustomIcons.tsx]), e.g. `BackstageIcon`.
- A [Material UI](https://v4.mui.com/components/material-icons/#material-icons) icon name, e.g. `GitHub`.

## Deployment details page resources

The deployment details page allows you to configure resource links.

### Configuration example

Below is an example configuration for the links on the deployment details page:

```yaml
gs:
  deploymentDetails:
    resources:
      - label: 'Grafana \n dashboard'
        icon: 'GrafanaIcon'
        url: 'https://grafana.${{BASE_DOMAIN}}/d/abcdefghijklmn/web-application-vitals?var-cluster=${{APP_CLUSTER_NAME}}&var-namespace=${{APP_NAMESPACE}}&var-application=${{APP_NAME}}'
```

### URL Templating

The `url` parameter supports templating with the following placeholders:

- `APP_CLUSTER_NAME` - name of the deployment target cluster.
- `APP_NAME` - name of the deployment.
- `APP_NAMESPACE` - namespace of the deployment.
- `BASE_DOMAIN` - base domain of the management cluster.
- `MC_NAME` - name of the management cluster.

### Icon Configuration

The icon parameter can be:

- A custom icon name from the list of [supported icons](https://github.com/giantswarm/backstage/blob/main/plugins/gs/src/assets/icons/CustomIcons.tsx]), e.g. `BackstageIcon`.
- A [Material UI](https://v4.mui.com/components/material-icons/#material-icons) icon name, e.g. `GitHub`.

## Home page resources

The home page allows you to configure resource links that will be displayed in place of the default links.

### Configuration example

Below is an example configuration for overriding the default links on the home page:

```yaml
gs:
  homepage:
    resources:
      - label: 'Giant Swarm \n GitHub'
        icon: 'GitHub'
        url: 'https://github.com/giantswarm'
      - label: 'Portal \n changelog'
        icon: 'BackstageIcon'
        url: 'https://github.com/giantswarm/backstage/releases'
```

### Icon Configuration

The icon parameter can be:

- A custom icon name from the list of [supported icons](https://github.com/giantswarm/backstage/blob/main/plugins/gs/src/assets/icons/CustomIcons.tsx]), e.g. `BackstageIcon`.
- A [Material UI](https://v4.mui.com/components/material-icons/#material-icons) icon name, e.g. `GitHub`.

## Optional features

Some optional features can be enabled and disabled via the app configuration. For example, the configuration snippet below will enable the `installationsPage` feature:

```yaml
gs:
  features:
    installationsPage:
      enabled: true
```

The following optional features are available:

- `clustersPage`: Enable the Clusters page, which lists all clusters -- both management and workload clusters -- in the installations the user has access to via the Backstage instance.
- `deploymentsPage`: Enable the Deployments page, which lists all the deployments -- `HelmRelease` and `App CR` resources -- in the installations the user has access to via the Backstage instance.
- `installationsPage`: Enable the Installations page, which lists all Resource entities of type _instalation_ in the catalog.
- `scaffolder`: Enables the scaffolder that lists available templates.

## Friendly labels and annotations

The `friendlyLabels` and `friendlyAnnotations` configuration allows you to control which Kubernetes resource labels/annotations are displayed and how they are formatted in the UI. Only items matching the configured patterns will be shown. If no configuration is provided, the following default is used for labels:

```yaml
friendlyLabels:
  - label: 'giantswarm.io/service-priority'
    key: 'Service priority'
    valueMap:
      highest: 'Highest'
      medium: 'Medium'
      lowest: 'Lowest'
```

For annotations, there is no default configuration.

### Configuration options

Each entry in `friendlyLabels` or `friendlyAnnotations` supports the following properties:

- **selector** (string, required):
  - Used to match labels/annotations on resources. Can be:
    - An exact key (e.g. `giantswarm.io/service-priority`)
    - A key-value pair (e.g. `giantswarm.io/service-priority:highest`)
    - A pattern (e.g. `giantswarm.io*`) to match multiple labels/annotations by key prefix.
- **key** (string, optional):
  - Overrides how the label/annotation key is displayed in the UI for matching items. If set, replaces the original key.
- **valueMap** (object, optional):
  - Maps label/annotation values to display values. If an item's value matches a key in this map, it will be replaced with the mapped value. If not, the original value is shown.

Properties applicable only for `friendlyLabels` configuration:

- **variant** (string, optional):
  - Applies additional visual styles to the label. Available variants are:
    `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `brown`.
  - See [`makeLabelVariants.ts`](../plugins/gs/src/components/LabelsCard/Labels/utils/makeLabelVariants.ts) for details.

**Note:**

- The order of entries in `friendlyLabels` or `friendlyAnnotations` is important. Items are matched and displayed in the order they appear in the configuration.
- Only labels/annotations matching a configured entry will be shown.

#### Example configuration

```yaml
gs:
  friendlyAnnotations:
    - selector: 'cluster.giantswarm.io/description'
      key: 'Cluster description'
  friendlyLabels:
    - selector: 'giantswarm.io/service-priority'
      key: 'Service priority'
      valueMap:
        highest: 'Highest'
        medium: 'Medium'
        lowest: 'Lowest'
    - selector: 'environment'
      key: 'Environment'
      valueMap:
        prod: 'Production'
        dev: 'Development'
      variant: 'green'
    - selector: 'giantswarm.io*'
      variant: 'blue'
```

This configuration will:

- Show only the specified labels and annotations.
- Display custom keys and values where configured.
- Apply visual variants for additional styling.
