# agent-platform-backend

Backend for the `agent-platform` plugin. Today it is a thin REST proxy over the
[kagent](https://github.com/kagent-dev/kagent) controller API, per installation,
consumed by the Agent Platform **Sessions** list.

## Why a proxy is needed

kagent sessions live in kagent's Postgres and are served over the controller's
HTTP API — unlike agents and model configs, they are not Kubernetes resources,
so the Kubernetes proxy the rest of the plugin uses cannot reach them.

Two things then force a backend hop:

- **CORS/CSP.** The browser cannot call `kagent.<baseDomain>` directly.
- **Header collision.** kagent runs with `controller.auth.mode: trusted-proxy`
  and derives the user from the `sub` claim of an `Authorization: Bearer` JWT.
  On the inbound leg that header already carries the Backstage identity, so the
  user's Dex ID token is forwarded in a separate header and promoted to
  `Authorization` here. Same approach as `muster-backend`.

## Endpoints

All routes are under `/api/agent-platform` and require `?installation=<name>`.

| Route                            | Token    | Purpose                                                    |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| `GET /health`                    | —        | `{ status, configured }` — how many installations resolved |
| `GET /kagent/installations`      | —        | Names of installations kagent can be proxied for           |
| `GET /kagent/sessions`           | required | The user's sessions, kagent's JSON verbatim                |
| `GET /kagent/sessions/:id`       | required | One session plus its stored events                         |
| `GET /kagent/sessions/:id/tasks` | required | The session's A2A tasks — conversation, state, token usage |
| `GET /kagent/me`                 | optional | Identity probe (see Diagnosing below)                      |

The user token is read from the `backstage-kagent-authorization` header, which
must match `KAGENT_AUTH_HEADER` in `plugins/agent-platform`.

Every kagent-side path stays under `/api`, because that is the only prefix either
door proxies to the controller.

Session ids are **opaque**: real responses mix 64-character hex strings and
UUIDs, so nothing validates a format — only that a path segment is present. They
are URL-encoded before being interpolated into the kagent URL.

### Why the session detail is two routes

The conversation comes from `…/tasks`, not from the `events` on `…/sessions/:id`.
That is what kagent's own UI does (`ui/src/components/chat/ChatInterface.tsx` →
`extractMessagesFromTasks`), and the two payloads carry different things:

|                    | `…/sessions/:id` → `events[]`                      | `…/sessions/:id/tasks` → `Task[]`         |
| ------------------ | -------------------------------------------------- | ----------------------------------------- |
| Message content    | `data` is a **JSON string** holding an A2A message | `history` is already structured           |
| Session state      | —                                                  | `status.state`                            |
| Token usage        | —                                                  | per-message `{adk,kagent}_usage_metadata` |
| Per-item timestamp | `created_at`                                       | only one per task                         |

So the frontend fetches both: tasks for the timeline, events only to recover
per-message timestamps (A2A messages carry none of their own).

Neither route sends an `A2A-Version` header. kagent's `NegotiateA2AWireVersion`
treats a missing header as the legacy v0 wire on both v0.9.9 and v0.10 — the
shape its own UI consumes, and therefore the best-tested one. Opting into the v1
wire would be a deliberate future migration.

A session belonging to another user answers **404**, exactly as a deleted one
does: kagent scopes the lookup by the token's user id. Both are expected outcomes
for a stale deep link, which is why neither becomes a 5xx (see below).

### Why there is no version endpoint

kagent serves `/version` at its **server root**, not under `/api`, and neither
door routes the root to the controller:

- The derived door's nginx sidecar (`helm/kagent/files/nginx.conf`) proxies only
  `location /api/` to `kagent-controller:8083`. `location /` goes to the kagent
  UI, which answers with HTML — so a probe would surface as a sign-in page on a
  perfectly healthy installation.
- The agentgateway override matches on the `/kagent` path prefix, so a
  root-relative `/version` never matches its HTTPRoute.

Nothing under `/api` exposes the controller version either (the `Version` fields
in `/api/substrate/status` are per-actor, not the controller's). Version
_tolerance_ does not depend on this — it lives in the frontend's permissive
parsing. If a future feature needs version gating, probe by behaviour (call a
version-specific endpoint and treat a 404 as "absent") rather than by version
string, or have the platform expose `/version` through the ingress.

### Deliberately a verbatim proxy

Responses are passed through untouched — the `{error, data, message}` envelope
is not unwrapped, unknown fields are not stripped, and nothing is filtered.
Schema tolerance lives in the frontend client, so a kagent schema change never
needs a backend release. The split is **backend = transport, frontend = schema**.

The one transport detail worth knowing: `redirect: 'manual'` is set so an
oauth2-proxy redirect into Dex surfaces as a 401 instead of being followed into
a 200 HTML sign-in page.

### Error mapping: "absent" vs "unwell"

The distinction matters because the frontend **silences** one and **surfaces** the
other, and getting it wrong makes a broken kagent look like an empty account.

| Upstream outcome                               | Error                 | HTTP | Frontend treats as             |
| ---------------------------------------------- | --------------------- | ---- | ------------------------------ |
| DNS failure, TLS error, connection refused     | `NotFoundError`       | 404  | not deployed here — **silent** |
| kagent's own 404 (or unknown-installation 400) | `NotFoundError`       | 404  | not deployed here — **silent** |
| 3xx, 401, or a 2xx non-JSON body               | `AuthenticationError` | 401  | read failure — reported        |
| 403                                            | `NotAllowedError`     | 403  | read failure — reported        |
| 5xx / 429, a timeout, or an unreadable body    | `UpstreamError`       | 500  | read failure — reported        |

Plus `ServiceUnavailableError` (503) when _no_ installation is configured at all —
a real misconfiguration, unlike the per-installation cases above.

Only the first two mean _nothing is there_. A timeout, a 500, or a truncated body
all mean kagent answered and failed, so they must not share an error with
"unreachable" — otherwise a degraded installation's sessions vanish from the
fleet-merged list with no alert and nothing logged.

### Never return a 5xx for an expected outcome

These status codes are not only about frontend classification — they decide what
reaches Sentry. `MiddlewareFactory.error()` logs at `error` for any status `>= 500`,
and the root logger forwards `warn`/`error` to Sentry
(`packages/backend-common/src/rootLogger.ts`).

On a fleet where kagent runs on two of fifteen installations, the Sessions tab
queries every reachable one and thirteen answer "no kagent here" — twice over,
counting the identity probe. As a 503 that would have raised ~26 Sentry events per
page view per user, fanned out into a separate issue per installation name. Hence
404: below the logging threshold, and semantically right.

Logging the cause at `debug` in the client does **not** avoid this — the throw is
what gets logged, by the middleware, after the client is done. The only fix is not
to raise a 5xx for something expected.

The inverse holds too: `UpstreamError` is deliberately a 500, because a
deployed-but-degraded kagent is rare and genuinely worth an alert.

## URL resolution

The base URL is **derived**, not configured per installation:
`https://kagent.<baseDomain>/api`, where `baseDomain` comes from
`gs.installations`. That matches the `agentic-platform-connectivity` chart's
`kagent.uiRoute.hostname` (`kagent.<codename>.<base>`), which is fronted by
oauth2-proxy and whose nginx sidecar proxies `/api/` to `kagent-controller:8083`.

`agentPlatform.kagent.installations` overrides this. When present it also acts
as the **allowlist**, which is worth setting since kagent is only deployed on
some installations:

```yaml
agentPlatform:
  kagent:
    timeoutMs: 10000
    installations:
      gazelle: {} # enabled, use the derived URL
      golem:
        # Point at a different ingress, e.g. the agentgateway door.
        apiBaseUrl: https://agentgateway.golem.example.io/kagent/api
```

Installations that resolve to no URL are logged once at init and skipped.

### Visibility

All `agentPlatform.kagent` keys keep the default **backend** visibility, so none
of them reach the unauthenticated frontend config. `apiBaseUrl` embeds
`baseDomain`, so exposing it would leak the installation topology to anyone
loading the page — the same reason `gs.installations` is backend-only. Verify
with:

```bash
yarn backstage-cli config:print --frontend --lax | grep -A5 agentPlatform
```

Only `skills.repositories` should appear. The frontend gets installation names
from `GET /kagent/installations` after sign-in instead.

## Diagnosing an empty or shared session list

kagent lists sessions with `WHERE user_id = <sub>`, so two failure modes look
like success. `GET /kagent/me` distinguishes them:

- **Empty list** — Dex issued a different `sub` for the Backstage client than
  for the client the user's existing sessions were created under.
- **Shared list** — the controller is running in `unsecure` mode, where the
  forwarded token is ignored and identity falls back to a default user. The
  frontend surfaces this as "not user-scoped" rather than implying the rows are
  the signed-in user's.
