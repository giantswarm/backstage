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

## GitOps repositories

The plugin allows you to format links to your GitOps sources. A link is being formatted based on a template string provided via configuration:

- **targetUrl**:  
  A template string used for formatting. It can include placeholders wrapped in `${{ }}`. Values that can be used:

  - `PATH`: Path of the resource in target repository. The value is taken from `.spec.path` field of a corresponding Kustomization resource;
  - `REVISION`: Commit reference. The value is taken from the `.status.artifact.revision` field of a corresponding GitRepository resource;
  - Additional values can be derived from the `.spec.url` field of a corresponding GitRepository resource using regex groups.

- **gitRepositoryUrlPattern**:  
  A regular expression used to extract values from the GitRepository `.spec.url` field. The names of the capturing groups (e.g., `HOSTNAME`, `PROJECT_NAME`) correspond to placeholder values that can be used in the `targetUrl`.

If no configuration is provided, two patterns for GitHub repositories are set as defaults:

```yaml
- targetUrl: 'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/blob/${{REVISION}}/${{PATH}}'
  gitRepositoryUrlPattern: '^ssh:\/\/git@(ssh\.)?(?<HOSTNAME>github.+?)(:443)?\/(?<REPOSITORY_PATH>.+?)(\.git)?$'

- targetUrl: 'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/blob/${{REVISION}}/${{PATH}}'
  gitRepositoryUrlPattern: '^https:\/\/(?<HOSTNAME>github.+?)\/(?<REPOSITORY_PATH>.+?)$'
```

When configuration is provided, the configured patterns are added to the two default ones.

### Configuration example

Below is an example configuration with several entries:

```yaml
gs:
  gitopsRepositories:
    - targetUrl: 'https://${{HOSTNAME}}/projects/${{PROJECT_NAME}}/repos/${{REPOSITORY_NAME}}/browse/${{PATH}}?at=${{REVISION}}'
      gitRepositoryUrlPattern: '^https:\/\/(?<HOSTNAME>bitbucket.+?)\/scm\/(?<PROJECT_NAME>.+?)\/(?<REPOSITORY_NAME>.+?)(\.git)?$'

    - targetUrl: 'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/-/tree/${{REVISION}}/${{PATH}}'
      gitRepositoryUrlPattern: '^ssh:\/\/git@(?<HOSTNAME>gitlab.+?)\/(?<REPOSITORY_PATH>.+?)(\.git)?$'
```

The result of this configuration is four patterns: two default ones for GitHub repositories and two additional ones for Bitbucket and GitLab.

### How it works

1. **Extraction:**  
   When processing a GitRepository resource, the plugin uses the regular expression defined in `gitRepositoryUrlPattern` to extract values (e.g., `HOSTNAME`, `PROJECT_NAME`) from the `.spec.url` field.

2. **URL Formation:**  
   The extracted values are then inserted into the `targetUrl` template by replacing the corresponding `${{PLACEHOLDER}}` entries.  
   For example, if a GitRepository URL is `https://bitbucket.example.net/scm/test-project/test-repo.git`, the regex will extract:
   - HOSTNAME: `bitbucket.example.net`
   - PROJECT_NAME: `test-project`
   - REPOSITORY_NAME: `test-repo`  
     These values are then used to form the target URL.

### Example outcomes

- **Bitbucket:**  
  With `.spec.url` as `https://bitbucket.example.net/scm/test-project/test-repo.git`, the URL becomes:

  ```
  https://bitbucket.example.net/projects/test-project/repos/test-repo/browse/test/repo/path?at=1234567890
  ```

- **GitLab:**  
  With `.spec.url` as `ssh://git@gitlab.example.com/test-project/test-repo.git`, the URL becomes:

  ```
  https://gitlab.example.com/test-project/test-repo/-/tree/1234567890/test/repo/path
  ```

- **GitHub:**  
  With `.spec.url` as one of:
  - `ssh://git@github.example.com:443/test-project/test-repo.git`
  - `ssh://git@github.example.com/test-project/test-repo`
  - `https://github.example.com/test-project/test-repo`  
    The URL becomes:
  ```
  https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path
  ```

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

## Well known labels

The `wellKnownLabels` configuration allows you to control which Kubernetes resource labels are displayed and how they are formatted in the UI. Only labels matching the configured patterns will be shown. If no configuration is provided, the following default is used:

```yaml
wellKnownLabels:
  - label: 'giantswarm.io/service-priority'
    key: 'Service priority'
    valueMap:
      highest: 'Highest'
      medium: 'Medium'
      lowest: 'Lowest'
```

### Configuration options

Each entry in `wellKnownLabels` supports the following properties:

- **label** (string, required):
  - Used to match labels on resources. Can be:
    - An exact key (e.g. `giantswarm.io/service-priority`)
    - A key-value pair (e.g. `giantswarm.io/service-priority:highest`)
    - A pattern (e.g. `giantswarm.io*`) to match multiple labels by key prefix.
- **key** (string, optional):
  - Overrides how the label key is displayed in the UI for matching labels. If set, replaces the original key.
- **valueMap** (object, optional):
  - Maps label values to display values. If a label's value matches a key in this map, it will be replaced with the mapped value. If not, the original value is shown.
- **variant** (string, optional):
  - Applies additional visual styles to the label. Available variants are:
    `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`, `brown`.
  - See [`makeLabelVariants.ts`](../plugins/gs/src/components/LabelsCard/Labels/utils/makeLabelVariants.ts) for details.

**Note:**

- The order of entries in `wellKnownLabels` is important. Labels are matched and displayed in the order they appear in the configuration.
- Only labels matching a configured entry will be shown.

#### Example configuration

```yaml
gs:
  wellKnownLabels:
    - label: 'giantswarm.io/service-priority'
      key: 'Service priority'
      valueMap:
        highest: 'Highest'
        medium: 'Medium'
        lowest: 'Lowest'
    - label: 'environment'
      key: 'Environment'
      valueMap:
        prod: 'Production'
        dev: 'Development'
      variant: 'green'
    - label: 'giantswarm.io*'
      variant: 'blue'
```

This configuration will:

- Show only the specified labels.
- Display custom keys and values where configured.
- Apply visual variants for additional styling.
