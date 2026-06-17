# Configuration

## Cluster access (broker-only)

Backstage reaches every management cluster through a single main Dex login. The
muster cluster-token broker exchanges the user's main session for a per-cluster
Kubernetes token (RFC 8693), so covered clusters need **no** per-cluster OIDC
login popup and **no** `auth.providers.oidc-<mc>` block. A complete, annotated
example is in [`/app-config.example.yaml`](../app-config.example.yaml).

### Main login provider

```yaml
gs:
  # Name of the single main login provider (defined under auth.providers).
  authProvider: oidc-main
```

### `gs.clusterTokenBroker`

Setting `tokenUrl` enables the silent per-cluster token path. Without it,
Backstage falls back to per-cluster OIDC popups.

```yaml
gs:
  clusterTokenBroker:
    # OAuth token endpoint of the broker. Its presence enables the broker path.
    tokenUrl: https://muster.example.gigantic.io/oauth/token
    # Confidential client registered with the broker (backend-only).
    clientId: ${CLUSTER_TOKEN_BROKER_CLIENT_ID}
    clientSecret: ${CLUSTER_TOKEN_BROKER_CLIENT_SECRET}
    # Optional. Usually unset -- the broker's per-audience config owns the scope.
    # scope: ...
```

### Broker-covered installations

Each cluster is listed under `gs.installations.<mc>` and in
`kubernetes.clusterLocatorMethods`. `oidcTokenProvider: oidc-<mc>` stays as the
k8s-plugin routing key, but for a broker-covered cluster it needs no matching
`auth.providers` entry. Setting `clusterTokenAudience` marks the installation as
fully broker-covered, so its token is minted silently and it disappears from the
provider settings page.

```yaml
gs:
  installations:
    example:
      authProvider: oidc
      oidcTokenProvider: oidc-example
      clusterTokenAudience: example # broker-covered
      pipeline: stable
      providers:
        - capa
```

### Cluster-access status element

A sidebar status element shows the per-installation access state -- healthy,
degraded (with a reason such as "Token broker is unreachable" or "API
unreachable (timeout)"), or session-expired (with a "Sign in again" action that
triggers the single main login). It is fed by both the broker token flow and
the clusters list, and requires no configuration.

When the main Dex session expires, the broker path triggers exactly one main
login prompt and then resumes -- there are no per-cluster popups.

### `gs.kubernetes.proxyTimeoutMs`

Bounds each Kubernetes proxy request (default `10000`). An unreachable cluster
becomes a fast, typed per-cluster error instead of freezing the whole clusters
list; healthy clusters render immediately and the degraded one is marked in the
status element and retried with capped backoff.

```yaml
gs:
  kubernetes:
    proxyTimeoutMs: 10000
```

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

## Component dependency fetching

For the Giant Swarm devportal, we can enable asynchronous fetching of dependencies between components, based on the GitHub SBOM API. This will start updating dependency info once daily.

```yaml
catalog:
  processors:
    sbomDependencies:
      enabled: true
      schedule:
        frequency: { cron: '0 2 * * *' } # default: daily at 2 AM UTC
        timeout: { minutes: 60 }
```

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
