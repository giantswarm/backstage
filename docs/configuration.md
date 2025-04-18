# Configuration

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
