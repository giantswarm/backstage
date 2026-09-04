# @giantswarm/backstage-plugin-plans-backend

Backend plugin (`pluginId: plans`) that exposes a small REST API over the
GitHub API for plan repositories (e.g. `giantswarm/bumblebee-plans`). It is
consumed by the `@giantswarm/backstage-plugin-plans` frontend plugin to render
proposed (open PR) and merged plan documents.

All routes require an authenticated Backstage user, since they serve
private-repo content. GitHub access runs as the caller: the frontend sends the
user's own GitHub OAuth token (from the portal's `github` auth provider) in the
`X-GitHub-Token` header, and every GitHub call -- reads and comment writes --
uses it. Comments therefore show up on GitHub authored by the person, and the
plugin never acts as a shared App identity. Routes other than `/repos` answer
401 without the header.

## Endpoints

All routes except `/repos` take `?repo=<owner/repo>`, which must be one of the
configured repositories. When exactly one repository is configured, the
parameter can be omitted.

| Route                                             | Purpose                                               |
| ------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/plans/repos`                            | Configured plan repositories                          |
| `GET /api/plans/pulls`                            | Open PRs (number, title, author, draft, branch, ...)  |
| `GET /api/plans/pulls/:number/files`              | Changed files of a PR, with the GitHub `patch` text   |
| `GET /api/plans/tree?ref=<branch>`                | Recursive git tree of a branch (defaults to `HEAD`)   |
| `GET /api/plans/content?ref=<branch>&path=<file>` | File content, base64-decoded                          |
| `GET /api/plans/pulls/:number/comments`           | PR discussion comments; `POST` adds one as the caller |
| `GET /api/plans/pulls/:number/review-comments`    | Inline review comments; `POST` adds one as the caller |
| `GET /api/plans/epics`                            | Epic references of merged and proposed plans          |

## Configuration

```yaml
plans:
  repositories:
    - giantswarm/bumblebee-plans
```

Without `plans.repositories`, the endpoints return 503 -- the plugin is
effectively disabled. Callers need read access to the listed repositories on
GitHub, and the GitHub App behind the portal's `github` auth provider must be
installed there with Pull requests and Issues write permission for comments.
