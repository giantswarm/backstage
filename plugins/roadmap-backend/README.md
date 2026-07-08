# @giantswarm/backstage-plugin-roadmap-backend

Backend plugin serving the GitHub Projects roadmap board through the
[`@giantswarm/pro`](https://github.com/giantswarm/pro) board core, consumed by
the `roadmap` frontend plugin.

## Auth model

- **Reads** (`GET /schema`, `/items`, `/items/:id`, `/resolve-item`,
  `/issues/:owner/:repo/:number/sub-issues`) use the deployed GitHub App
  credentials from the standard `integrations.github` config. Responses are
  cached in memory (items 60s, schema 10min) since board queries paginate the
  full project.
- **Writes** (`PATCH /items/:id/field`, `POST`/`DELETE` sub-issue routes)
  require a per-user GitHub OAuth token in the `X-GitHub-Token` header, so
  every board mutation is attributed to the acting user on GitHub. There is no
  fallback to the App token for mutations. The frontend obtains the token via
  `githubAuthApiRef.getAccessToken(['project'])`.

All routes require an authenticated Backstage user.

## Configuration

```yaml
roadmap:
  board: roadmap # board key known to @giantswarm/pro (roadmap | customer)
  teams: # optional Team filter values offered in the UI; first = default
    - Team Bumblebee🐝
```

The GitHub App needs the org-level **Projects: read** permission (and
**Issues: read** for sub-issues and item bodies). Local development can fall
back to a PAT with `project` and `repo` scopes via `integrations.github`.
