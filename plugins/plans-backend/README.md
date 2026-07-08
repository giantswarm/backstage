# @giantswarm/backstage-plugin-plans-backend

Backend plugin (`pluginId: plans`) that exposes a small REST API over the
GitHub API for plan repositories (e.g. `giantswarm/bumblebee-plans`). It is
consumed by the `@giantswarm/backstage-plugin-plans` frontend plugin to render
proposed (open PR) and merged plan documents.

All routes require an authenticated Backstage user, since they serve
private-repo content. GitHub access uses the deployed GitHub App credentials
via the standard `integrations.github` config
(`ScmIntegrations` + `DefaultGithubCredentialsProvider`).

## Endpoints

All routes except `/repos` take `?repo=<owner/repo>`, which must be one of the
configured repositories. When exactly one repository is configured, the
parameter can be omitted.

| Route                                             | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/plans/repos`                            | Configured plan repositories                         |
| `GET /api/plans/pulls`                            | Open PRs (number, title, author, draft, branch, ...) |
| `GET /api/plans/pulls/:number/files`              | Changed files of a PR, with the GitHub `patch` text  |
| `GET /api/plans/tree?ref=<branch>`                | Recursive git tree of a branch (defaults to `HEAD`)  |
| `GET /api/plans/content?ref=<branch>&path=<file>` | File content, base64-decoded                         |

## Configuration

```yaml
plans:
  repositories:
    - giantswarm/bumblebee-plans
```

Without `plans.repositories`, the endpoints return 503 -- the plugin is
effectively disabled. The GitHub App configured under `integrations.github`
must have access to the listed repositories.
