# agent-platform-backend

Backend for the `agent-platform` plugin: the browser's door to the
[kagent](https://github.com/kagent-dev/kagent) API v2 controller, per
installation, plus one route that tries a served model against the
installation's models Gateway (`POST /served-models/try`, held to the
installation's own domain). It speaks **native gRPC** to the controller and
hands the frontend **JSON and SSE**. Everything else about models — the
inventory, the backends, serving — the frontend does through muster's
`x_model-manager_*` tools as the signed-in person; no model-manager URL or
client lives here.

## Why a backend is needed

On the kagent API v2 line a chat session is a **`Session`** — one
conversation of one person with one `Agent` (which names its `Harness`) — held
in the controller's database and served over gRPC (`kagent.api.v1alpha1.*`), with
the turns on the A2A v1 service (`lf.a2a.v1.A2AService`). None of that is a
Kubernetes resource, so the Kubernetes proxy the rest of the plugin uses cannot
reach it, and:

- **gRPC wants a server.** HTTP/2 gRPC is not something a browser tab speaks,
  and `agentgateway.<baseDomain>` is cross-origin anyway.
- **Identity is the bearer.** agentgateway validates the person's
  per-installation Dex ID token on the controller route and derives the caller
  from its `email` claim, dropping any inbound identity header. On the inbound
  leg to Backstage the `Authorization` header already carries the Backstage
  identity, so the token travels in a separate `backstage-kagent-authorization`
  header and becomes the `authorization` metadata of every gRPC call here.
  **Nothing else identifying is ever sent** — a test asserts it.

## What it speaks

Generated Connect client (`src/kagent/gen`, protoc-gen-es from the line's protos,
pinned by commit — see the README there) over connect-node's HTTP/2 gRPC
transport, one transport per installation. The RPCs in use:

| Service          | RPCs                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SessionService` | `ListSessions` (caller only, never `all_creators`), `CreateSession`, `GetSession`, `UpdateSessionName`, `DeleteSession` |
| `SystemService`  | `GetCurrentUser` (the identity probe), `GetVersion` (the reachability probe)                                            |
| `A2AService`     | `SendMessage`, `SendStreamingMessage`, `ListTasks`, `GetTask`, `CancelTask`                                             |

Every A2A call is addressed to the Agent as the request's `tenant`
(`<namespace>/<name>`) with the session's A2A context (`contextId`, equal to the
session id) on the message or the listing — the gateway routes by those, never by
metadata, and a send without them would start a new session — and requests the
human-in-the-loop extension (`a2a-extensions: https://kagent.dev/extensions/hitl/v1`), so a
confirmation that arrives on a turn is a typed request the panel can render.

## Endpoints

All routes are under `/api/agent-platform` and require `?installation=<name>`.

| Route                                               | Token    | RPC                            | Purpose                                                                              |
| --------------------------------------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /health`                                       | —        | —                              | `{ status, configured }` — how many installations resolved                           |
| `GET /kagent/installations`                         | —        | `GetVersion` (unauthenticated) | Installations kagent is configured for, with reachability                            |
| `GET /kagent/session-states`                        | required | `ListSessions`, `ListTasks`    | Derived state per session for the session lists and the shell rail                   |
| `GET /kagent/session-usage`                         | required | `ListSessions`, `ListTasks`    | The caller's token/turn/tool usage for the Usage tab                                 |
| `GET /kagent/sessions`                              | required | `ListSessions`                 | The caller's sessions, proto3 JSON (`{sessions: […]}`)                               |
| `GET /kagent/sessions/:id`                          | required | `GetSession`                   | One session (`{session}`)                                                            |
| `PUT /kagent/sessions/:id`                          | required | `UpdateSessionName`            | Rename (`{name}`, ≤ 200 characters)                                                  |
| `DELETE /kagent/sessions/:id`                       | required | `DeleteSession`                | Delete                                                                               |
| `GET /kagent/sessions/:id/tasks`                    | required | `ListTasks` (all pages)        | The conversation, its state and token usage (`{tasks: […]}`)                         |
| `POST /kagent/sessions/:id/messages`                | required | `SendMessage`                  | One turn, waited out up to `turnTimeoutMs`; 202 when still running                   |
| `POST /kagent/sessions/:id/messages/stream`         | required | `SendStreamingMessage`         | One turn, relayed as SSE frames of `StreamResponse` JSON                             |
| `POST /kagent/sessions/:id/answer`                  | required | `GetTask`, `SendMessage`       | Answer the confirmation a task is suspended on, resuming it                          |
| `POST /kagent/sessions/:id/tasks/:taskId/cancel`    | required | `CancelTask`                   | Stop the turn server-side                                                            |
| `POST /kagent/sessions/:id/tasks/:taskId/subscribe` | required | `SubscribeToTask`              | Follow a running turn again after its stream was cut, relayed as SSE like the stream |
| `GET /kagent/me`                                    | optional | `GetCurrentUser`               | Identity probe: the claims the controller resolved                                   |

The user token is read from the `backstage-kagent-authorization` header, which
must match `KAGENT_AUTH_HEADER` in `plugins/agent-platform`.

### Responses are the controller's, as JSON

The backend renders each response with protobuf-es `toJson` and passes it on:
proto3 JSON, camelCase, enums as their names (`AGENT_INSTANCE_STATE_READY`,
`TASK_STATE_WORKING`), timestamps as RFC 3339. Nothing is reshaped here; the
schema tolerance for these shapes lives in `agent-platform-common`, which also
still reads the 0.10 envelope. The split is **backend = transport, frontend =
schema**, so a wire change on the line is a common-package change and never a
backend release.

### Session states are derived here

`GET /kagent/session-states` is the exception to "nothing is reshaped": it
answers one summary entry per session, computed from the session list and each
candidate's newest task (status only), cached per caller for 15 seconds. Its
shape is `SessionStatesResponse` in `agent-platform-common`:

```json
{
  "evaluatedAt": 1760518800000,
  "states": [
    { "sessionId": "…", "state": "input-required", "changedAt": 1760518000000 },
    {
      "sessionId": "…",
      "state": "failed",
      "changedAt": 1760517000000,
      "failureReason": "model-unavailable"
    }
  ],
  "unreadable": [],
  "skipped": 0
}
```

- `state` is the A2A state as kagent reports it, or the instance's own state
  when that decides (`failed`, `creating`, `deleting`).
- `failureReason`: `model-unavailable`, `tool-failed`, `runtime-lost` or
  `other`. Present on a failed or rejected newest turn (from its
  `status.message`), on a failed instance (from its `Failure`), and on any
  session kagent marked `RUNTIME_LOST` (`runtime-lost`, whatever its newest
  turn's `state`: kagent keeps such a session READY). Classified by
  `classifyFailureText` in `agent-platform-common`. Only the class leaves the
  backend, never the text: that is the provider's raw error and may carry
  URLs, model ids and response bodies. `model-unavailable` means the model
  cannot be had (unknown, refused, rate-limited, failing); a request the
  provider rejected as wrong, such as a conversation that outgrew the context
  window, is `other`, as is any text that matches no shape kagent is known to
  produce.

### Sessions are not created here

A session starts through agent-manager's `start_session`, which the frontend
calls through muster as the signed-in person; this backend has no create route.
It reads, sends to, renames and deletes sessions that already exist.

### Answering a confirmation

Human-in-the-loop is the negotiated extension above. The paused task's
`status.message` carries a typed `tool_approval_request` or `ask_user_request`
in its metadata; the reply is a `SendMessage` naming the task with the typed
response in the same place. The controller validates that reply strictly (every
requested tool decided exactly once, every question answered, the correlation
id echoed), so the payload is built from the request the controller recorded
(`GetTask`) and never from anything the browser claims — the browser only says
approve/reject and the answers in the order asked. See `src/kagent/hitl.ts`.

### Stop

`CancelTask` on the instance ends the run at the harness — or, when the runtime
cannot, the gateway quiesces the actor and records the task canceled itself —
and answers the task as the controller left it. Cancelling a finished turn is
not an error. Cutting the SSE relay, by contrast, stops nothing: the turn
survives it and the poll shows it finish.

### Reachability

`GET /kagent/installations` answers `{ installations: [{ name, reachable,
reason? }] }`. `reachable` is `true`, `false` or `'unknown'`: whether the
installation's controller origin can be reached _from this portal_, learned from
one **unauthenticated** `SystemService/GetVersion` per origin
(`src/kagent/reachability.ts`) — no token, no user data, nothing performed. Behind
the JWT policy that answers `Unauthenticated`, which proves the route exactly as
a 401 did; any answer at all is the proof. A DNS failure, a refused or reset
connection, a TLS failure or no answer within 3 s means `false`, with `reason`
naming the failure class (codes only, never the host). Answers are cached five
minutes in gs-node's `ReachabilityCache` and refreshed in the background; the
route never waits for a probe.

### Error mapping: "absent" vs "unwell"

The distinction matters because the frontend **silences** one and **surfaces** the
other, and getting it wrong makes a broken kagent look like an empty account.

| Connect outcome                                                  | Error                 | HTTP | Frontend treats as             |
| ---------------------------------------------------------------- | --------------------- | ---- | ------------------------------ |
| socket-level cause: DNS, refused, reset, TLS                     | `NotFoundError`       | 404  | not deployed here — **silent** |
| `NotFound` (gone, or somebody else's); `Unimplemented`           | `NotFoundError`       | 404  | not deployed here — **silent** |
| `Unauthenticated`                                                | `AuthenticationError` | 401  | read failure — reported        |
| `PermissionDenied`                                               | `NotAllowedError`     | 403  | read failure — reported        |
| `InvalidArgument`                                                | `InputError`          | 400  | rejected request — reported    |
| `AlreadyExists`, `FailedPrecondition`, `Aborted`, an active task | `ConflictError`       | 409  | conflict — reported            |
| `DeadlineExceeded` on a send                                     | 202 `pending`         | 202  | still running — poll           |
| `Unavailable` without a socket cause, `Internal`, `Unknown`      | `UpstreamError`       | 500  | read failure — reported        |

Plus `ServiceUnavailableError` (503) when _no_ installation is configured at all —
a real misconfiguration, unlike the per-installation cases above. A send whose
transport failed is **verified** against the instance's tasks before it is
reported: if the message landed, the turn is running and the answer is a 202.

### Never return a 5xx for an expected outcome

These status codes decide what reaches Sentry: `MiddlewareFactory.error()` logs at
`error` for any status `>= 500`, and the root logger forwards `warn`/`error` to
Sentry. On a fleet where kagent runs on two of fifteen installations, the Sessions
tab queries every reachable one and thirteen answer "no kagent here" — as a 5xx
that would be a Sentry event per installation per page view per user. Hence 404
for "absent", and 409/400/202 for the expected refusals. `UpstreamError` is
deliberately a 500, because a deployed-but-degraded kagent is rare and genuinely
worth an alert.

## Configuration

The origin is **derived**, not configured per installation:
`https://agentgateway.<baseDomain>`, where `baseDomain` comes from
`gs.installations`. That is the `agent-platform-connectivity` chart's controller
route hostname (`kagent.controllerRoute.hostname`, default
`agentgateway.<domain>`), on which its `GRPCRoute` serves the controller's
services through agentgateway — and the origin the chart itself writes as
`apiBaseUrl` when it renders the Backstage app-config. `kagent.<baseDomain>` is
the kagent UI behind oauth2-proxy and carries no gRPC. No path: gRPC is matched
by service, not by prefix.

`agentPlatform.kagent.installations` overrides this. When present it also acts
as the **allowlist**, which is worth setting since kagent is only deployed on
some installations:

```yaml
agentPlatform:
  kagent:
    timeoutMs: 10000
    turnTimeoutMs: 30000
    installations:
      lab: {} # enabled, use the derived origin
      dev:
        # An in-cluster controller for local development: plaintext h2c, no
        # gateway and therefore no boundary — never a fleet shape.
        apiBaseUrl: http://kagent-controller.kagent.svc.cluster.local:8083
```

Installations that resolve to no URL are logged once at init and skipped. The
`sessionStates` and `sessionUsage` blocks bound the two derived fan-outs; see
`config.d.ts`.

### Visibility

All `agentPlatform.kagent` keys keep the default **backend** visibility, so none
of them reach the unauthenticated frontend config. `apiBaseUrl` embeds
`baseDomain`, so exposing it would leak the installation topology to anyone
loading the page — the same reason `gs.installations` is backend-only. The
frontend gets installation names from `GET /kagent/installations` after sign-in
instead.

## Diagnosing an empty or shared session list

The controller lists instances for the caller the gateway identified, so two
failure modes look like success. `GET /kagent/me` distinguishes them:

- **Empty list** — the route derived a different identity than the one the
  person's instances were created under.
- **Shared list** — the controller was reached without agentgateway in front of
  it and attributes every caller to its built-in default user
  (`admin@kagent.dev`). The frontend surfaces this as "not user-scoped" rather
  than implying the rows are the signed-in user's.

## Tests

`KagentClient.test.ts` runs the client against a **fake controller**
(`src/kagent/testing/fakeController.ts`) implementing the RPCs above in-process,
over Connect's in-memory router transport; `KagentTransport.test.ts` puts the
same fake behind a real HTTP/2 (h2c) server and drives it over the production
gRPC transport, asserting the raw headers that cross the wire. `router.test.ts`
pins the browser contract.
