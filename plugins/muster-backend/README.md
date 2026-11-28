# @giantswarm/backstage-plugin-muster-backend

Backend plugin (`pluginId: muster`) that exposes a small REST API over the
[muster](https://github.com/giantswarm/muster) MCP server's core workflow
tools. It is consumed by the `@giantswarm/backstage-plugin-muster` frontend
plugin for workflow visualization.

## Endpoints

| Route                                                          | MCP tool                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/muster/workflows`                                    | `core_workflow_list`                                       |
| `GET /api/muster/executions?workflow_name&status&limit&offset` | `core_workflow_execution_list`                             |
| `GET /api/muster/executions/:id`                               | `core_workflow_execution_get` (with `include_steps: true`) |
| `GET /api/muster/auth/status`                                  | `resources/read` of `auth://status`                        |
| `POST /api/muster/auth/login` (body `{ server }`)              | `core_auth_login`                                          |
| `GET /api/muster/servers/names`                                | `core_mcpserver_list` (`showAll: true`)                    |

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

`GET /servers/names` answers `{ servers: [{ name, family?, displayName? }] }`:
what the sign-in prompts (the notification inbox, the sign-in dialog, the
connector alerts) call each connector, read as the person. muster lists the
servers the person may see, the ones `auth://status` reports, so the names are
there for people without Kubernetes access to the `MCPServer` objects too. Its
readers run in the background, so a failed list answers
`{ servers: [], unavailable: true }` with HTTP 200, and the prompts keep the
servers' own names.

**Both auth routes require the installation to declare an `authProvider`** and
are inert otherwise. Muster scopes downstream auth state to one MCP session, and
the session cache is keyed on the forwarded user token — with no token every
portal user shares a single session, so one user's completed sign-in would
connect a downstream server for everybody and let the next user call it under the
first user's OAuth grant. Read-only discovery tolerates that shared session;
per-user auth does not.

## Unauthorized answers

Every `401` of these routes (`/call` and `/call/progress` included) says why in
`error.reason`, and is logged at info with the installation, the route and the
reason. Neither the body nor the log carries the token, the person's identity or
muster's own text.

| `error.reason`            | When                                                                                                        | What the frontend does                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `server_sign_in_required` | muster answered `auth_required`: the person has not signed in to the server (`error.server`) the call needs | Offers that server's sign-in                      |
| `token_missing`           | The request forwarded no token for an installation that needs one                                           | Refreshes the token and sends the call again once |
| `token_expired`           | The forwarded token's `exp` has passed (checked before muster is called), or muster said it expired         | The same                                          |
| `token_rejected`          | muster refused a forwarded token that has not expired                                                       | The same                                          |

Where muster asks for the person's grant of provider Apps rather than a sign-in
to the server (its `auth_required` answer with `structuredContent.apps`), the
`server_sign_in_required` body also carries `error.apps`, one `{app, authUrl?}`
per App, and the Agent Platform pages offer each App's sign-in.

Each is refused before a tool runs, so sending a write again with a new token
cannot run it twice. The frontend never retries a `401` with backoff.

## Configuration

The installations the proxy can target are **derived from the fleet
configuration**: every `gs.installations` entry with a `baseDomain` yields a
muster endpoint at `https://muster.<baseDomain>/mcp` (the same derivation the
kagent proxy uses for `https://agentgateway.<baseDomain>`). Nothing has to be
listed for an installation that adopts muster; whether it actually runs muster
is the frontend's question (the installation inventory reads the
`muster.giantswarm.io` API group), and whether the endpoint is reachable from
this portal is answered by the unauthenticated reachability probe.

`muster.installations` holds **overrides** of that derived list. An entry with
the same `name` as a fleet installation overrides its `url`, `headers`,
`prometheusServer` and `authProvider` field by field; an entry whose name the
fleet configuration does not know adds an installation (then `url` is
required). `authProvider` is the installation's sign-in provider,
`oidc-<installation>`: the provider whose Dex issues the token the entry is
reached with (the main sign-in provider, `gs.authProvider`, on the home
installation; the token the cluster token broker mints from that session on
every other one). `mcp-*` names are dedicated `auth.providers` PKCE providers,
which single sign-on replaced; they are not the value here.

```yaml
muster:
  installations:
    # Overrides only the endpoint of a derived installation. Its pages
    # (approval, sign-in) stay on muster's public URL, so name it.
    - name: golem
      url: https://muster-internal.golem.example/mcp
      publicUrl: https://muster.golem.example
    # Adds an installation the fleet configuration does not know.
    - name: lab
      url: https://muster.lab.example/mcp
      authProvider: oidc-lab
```

`publicUrl` is where that muster serves its own pages (its
`muster.oauth.mcpClient.publicUrl`). Set it only when that is not on the host of
`url`: the session page returns a person from muster's approval page and
sign-in start only for links on it, else on the origin of `url`; otherwise those
links open as sent and the person presses _Done_. muster's
`postLoginRedirectAllowlist` must admit the portal either way.

Routes (all take the person's token; `installation=<name>`):

| Route                                 | Body                                                  | Answer                                                         |
| ------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `POST /api/muster/handoff`            | `{"url"}` (sign-in start or approval page)            | `{ "ticket" }`, or `{}` when muster issues none (never logged) |
| `POST /api/muster/approvals/view`     | `{"url"}` (approval page)                             | `{ "view" }` or `{ "refusal": { status, error, message } }`    |
| `POST /api/muster/approvals/decision` | `{"url", "decision": "approve"\|"decline", "digest"}` | `{ "status": "approved"\|"declined" }` or `{ "refusal" }`      |

Only a link to the installation's approval page is accepted (400 otherwise);
the chat calls `decision` only on the person's click.

Trust, all enforced by muster:

- Tickets and decisions only for OAuth clients in muster's
  `approval.trustedClients` (formerly `approval.handoffClients`): list the
  portal's own Dex client (the `azp` of the forwarded token), never a client a
  CLI or an agent signs in through.
- All three routes also send the portal's workload token in
  `X-Muster-Approval-Client`: the projected ServiceAccount token (audience
  `muster`) read on every request from `muster.workloadTokenFile`, default
  `/var/run/secrets/muster.giantswarm.io/serviceaccount/token` (mounted by the
  Agent Platform chart). muster reviews it (TokenReview, then verb `decide` on
  `toolapprovals.muster.giantswarm.io`, granted only to the portal's
  ServiceAccount). Without the file none is sent and muster refuses
  (`untrusted_workload`); the chat opens muster's own pages. `agentlab portal
dev` mints one and sets `muster.workloadTokenFile`.
- Before muster is called, the forwarded token's identity must be the signed-in
  Backstage user (`oidcIdentity` in gs-node: `user:oidc/<hash of sub>`, or for
  staff the catalog user with that GitHub username or verified email). Another
  person's token, no user, a service or the guest gets 403, logged as
  `muster_token_not_own` (never the token).
- Only one installation's muster gets the workload token:
  `muster.workloadInstallation`, else the `gs.installations` entry whose
  `oidcTokenProvider` is `gs.authProvider`, else the only muster installation.
  Every other installation answers `untrusted_workload` (and `/handoff` `{}`)
  without asking its muster.

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
