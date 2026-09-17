# @giantswarm/backstage-plugin-repositories-backend

Backend plugin (`pluginId: repositories`) for the Repositories page: a gateway
over [giantswarm-repo-manager](https://github.com/giantswarm/giantswarm-repo-manager)'s
tools, reached through muster as the signed-in person. Every write lands as a
team-file pull request under that person's name.

| Route                                | Tool                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `GET /connection`                    | `core_auth_login`                                    |
| `GET /info`                          | `get_info`                                           |
| `GET /repositories?<filters>`        | `list_repositories`                                  |
| `GET /repositories/:name`            | `get_repository`                                     |
| `POST /repositories/:name/refresh`   | `refresh_repository`                                 |
| `POST /repositories/validate`        | `validate_repository` (the dry run of a declaration) |
| `POST /repositories`                 | `create_repository`                                  |
| `POST /repositories/:name/update`    | `update_repository`                                  |
| `POST /repositories/:name/transfer`  | `transfer_repository`                                |
| `POST /repositories/:name/lifecycle` | `set_lifecycle`                                      |
| `POST /repositories/:name/reconcile` | `reconcile_repository`                               |

The filters are the tool's own arguments (`scope`, `search`, `renovate`,
`team`, `visibility`, `fork`, `lifecycle`, `archived`, `inactiveDays`,
`finding`, `limit`), type-checked and handed on unchanged; the answers are the
tools' answers. Every request
carries the user's main login (Dex) ID token in the
`backstage-muster-authorization` header; muster forwards it to the manager,
which obtains the person's GitHub grant from muster's token broker. A session
without a grant gets a 401 carrying muster's sign-in URL, which the page
follows and returns from.

The write routes take the tool's own arguments in a JSON body -- `dryRun` and
`mode` included, handed on as given: the manager accepts `commit` only and
refuses `apply` with its reason. A tool-level refusal (a mode, a taken name, a
declaration the engine refuses, a non-member) is a 403 carrying that reason;
the page shows it verbatim. A broken hop keeps its 5xx.

## Configuration

```yaml
repositories:
  muster:
    installation: <installation> # a name in muster.installations
    server: giantswarm-repo-manager
```

Without `repositories.muster` every route answers 503.
