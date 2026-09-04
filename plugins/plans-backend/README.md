# @giantswarm/backstage-plugin-plans-backend

Backend plugin (`pluginId: plans`) that exposes a small REST API over the
GitHub API for plan repositories (e.g. `giantswarm/bumblebee-plans`). It is
consumed by the `@giantswarm/backstage-plugin-plans` frontend plugin to render
proposed (open PR) and merged plan documents.

All routes require an authenticated Backstage user, since they serve
private-repo content. GitHub access runs as the caller, through muster: the
frontend sends the user's main login (Dex) ID token in the
`backstage-muster-authorization` header, the backend calls the GitHub MCP
server registered in muster (`plans.muster`) with it, and muster executes every
GitHub call -- reads and comment writes -- with the person's own GitHub grant.
Comments therefore show up on GitHub authored by the person, and neither the
plugin nor the portal holds a GitHub credential. A caller whose muster session
has no GitHub grant yet gets `401` with `error.name: MusterServerNotConnectedError`,
`error.server` and `error.authUrl`, muster's sign-in URL (the same answer the
roadmap backend gives, both through `@giantswarm/backstage-plugin-gs-node`); `GET /api/plans/connection` reports
the same without failing a request, so the frontend can offer "Connect GitHub"
and poll until the person completed it.

## Endpoints

All routes except `/repos` take `?repo=<owner/repo>`, which must be one of the
configured repositories. When exactly one repository is configured, the
parameter can be omitted.

| Route                                             | Purpose                                               |
| ------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/plans/repos`                            | Configured plan repositories                          |
| `GET /api/plans/connection`                       | Whether the caller can reach GitHub, else the sign-in |
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
  muster:
    installation: gazelle # a name from muster.installations
    server: github # the GitHub MCPServer in that muster
    # toolPrefix: github  # default: the server name; tools are x_<prefix>_<tool>
```

Without `plans.repositories` or `plans.muster`, the endpoints return 503 --
the plugin is effectively disabled. Callers need read access to the listed
repositories on GitHub through their own account; the GitHub MCP server
behind muster is the hosted one (`https://api.githubcopilot.com/mcp/`) or any
server exposing the same tools, connected to GitHub with muster's GitHub
connector (`spec.auth.authorizationServer` with a pre-registered client and
`grantScope: subject`), so one consent serves every session of the person.
