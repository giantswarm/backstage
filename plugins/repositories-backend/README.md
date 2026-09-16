# @giantswarm/backstage-plugin-repositories-backend

Backend plugin (`pluginId: repositories`) for the Repositories page: a gateway
over [giantswarm-repo-manager](https://github.com/giantswarm/giantswarm-repo-manager)'s
read tools, reached through muster as the signed-in person.

| Route                              | Tool                 |
| ---------------------------------- | -------------------- |
| `GET /connection`                  | `core_auth_login`    |
| `GET /info`                        | `get_info`           |
| `GET /repositories?<filters>`      | `list_repositories`  |
| `GET /repositories/:name`          | `get_repository`     |
| `POST /repositories/:name/refresh` | `refresh_repository` |

The filters are the tool's own arguments (`scope`, `search`, `renovate`,
`team`, `visibility`, `fork`, `lifecycle`, `inactiveDays`, `minOrphanScore`,
`decision`, `finding`, `undeclared`, `limit`, `stalePeriodDays`), type-checked
and handed on unchanged; the answers are the tools' answers. Every request
carries the user's main login (Dex) ID token in the
`backstage-muster-authorization` header; muster forwards it to the manager,
which obtains the person's GitHub grant from muster's token broker. A session
without a grant gets a 401 carrying muster's sign-in URL, which the page
follows and returns from.

## Configuration

```yaml
repositories:
  muster:
    installation: gazelle # a name in muster.installations
    server: giantswarm-repo-manager
```

Without `repositories.muster` every route answers 503.
