# @giantswarm/backstage-plugin-muster-backend

Backend plugin (`pluginId: muster`) that exposes a small REST API over the
[muster](https://github.com/giantswarm/muster) MCP server's core workflow
tools. It is consumed by the `@giantswarm/backstage-plugin-muster` frontend
plugin for workflow visualization.

## Endpoints

| Route                                                          | MCP tool                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/muster/workflows`                                    | `core_workflow_list`                                       |
| `GET /api/muster/workflows/:name`                              | `core_workflow_get`                                        |
| `GET /api/muster/executions?workflow_name&status&limit&offset` | `core_workflow_execution_list`                             |
| `GET /api/muster/executions/:id`                               | `core_workflow_execution_get` (with `include_steps: true`) |
| `GET /api/muster/auth/status`                                  | `resources/read` of `auth://status`                        |
| `POST /api/muster/auth/login` (body `{ server }`)              | `core_auth_login`                                          |

`POST /auth/login` starts the OAuth flow for one _aggregated_ MCP server (as
opposed to authenticating to muster itself). Muster answers in free text, so the
route normalises it to `{ status, authUrl?, message }` — `auth_required` carries
the sign-in URL the user must open in a browser, after which muster's own OAuth
callback connects the server for that muster session. Muster's refusals
(SSO-managed server, rate limit, undiscoverable issuer) are expected outcomes
here and come back as `{ status: 'error' }` with HTTP 200, never a 5xx —
infrastructure faults keep their 5xx so an outage isn't reported to the user as a
policy decision.

`auth://status` is read with a native MCP `resources/read`, not through the
`get_resource` meta-tool: that meta-tool aggregates the resources of the
_downstream_ servers and never sees the aggregator's own `auth://status`. muster's
CLI reads it the same way. An unavailable resource answers
`{ servers: [], unavailable: true, message }` rather than a 5xx, since the
frontend polls this route every few seconds while a sign-in is outstanding; the
flag is what lets a waiting row distinguish "nothing needs a sign-in" from "the
status can't be read".

**Both auth routes require the installation to declare an `authProvider`** and
are inert otherwise. Muster scopes downstream auth state to one MCP session, and
the session cache is keyed on the forwarded user token — with no token every
portal user shares a single session, so one user's completed sign-in would
connect a downstream server for everybody and let the next user call it under the
first user's OAuth grant. Read-only discovery tolerates that shared session;
per-user auth does not.

## Configuration

The installations the proxy can target are **derived from the fleet
configuration**: every `gs.installations` entry with a `baseDomain` yields a
muster endpoint at `https://muster.<baseDomain>/mcp` (the same derivation the
kagent proxy uses for `https://kagent.<baseDomain>/api`). Nothing has to be
listed for an installation that adopts muster; whether it actually runs muster
is the frontend's question (the installation inventory reads the
`muster.giantswarm.io` API group), and whether the endpoint is reachable from
this portal is answered by the unauthenticated reachability probe.

`muster.installations` holds **overrides** of that derived list. An entry with
the same `name` as a fleet installation overrides its `url`, `headers`,
`prometheusServer` and `authProvider` field by field; an entry whose name the
fleet configuration does not know adds an installation (then `url` is
required):

```yaml
muster:
  installations:
    # Overrides only the endpoint of a derived installation.
    - name: gazelle
      url: https://muster-internal.gazelle.example/mcp
    # Adds an installation the fleet configuration does not know.
    - name: lab
      url: https://muster.lab.example/mcp
      authProvider: mcp-muster
```

`GET /api/muster/installations` reports each installation with its `source`
(`derived` or `configured`), whether it requires the person's token
(`requiresAuth`; always true for a derived installation, since every muster
gates) and its reachability from this portal. One line is logged at start with
the counts (`N derived …, M configured …, T total`).

When nothing is derived and nothing is listed, the plugin falls back to the
legacy single-installation setup and reuses the muster entry of the
`aiChat.mcp` server list:

```yaml
aiChat:
  mcp:
    - name: muster
      url: http://localhost:8091/mcp
```

The entry is selected by name (`muster` by default); set `muster.serverName`
to use a different one. Entries with static `headers` are supported; entries
with `useBackstageUserToken` are not, the plugin logs a warning and the
endpoints return 503.

The MCP client connection is cached for 30 minutes and recreated when the
transport reports closure (same self-healing approach as ai-chat-backend).
