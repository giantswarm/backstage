---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Add the `agent-platform-backend` plugin: a thin REST proxy over the kagent
controller API, per installation. It is the transport the upcoming Agent
Platform "Sessions" list needs — kagent sessions live in kagent's Postgres and
are served over HTTP, so unlike agents and model configs they are not
Kubernetes resources and the Kubernetes proxy cannot reach them.

- `GET /kagent/sessions` (user token required), plus a `/kagent/me` identity
  probe (token optional) and `/kagent/installations`, which returns names only —
  the kagent URL is derived from `baseDomain`, which is backend-only because it
  deanonymizes customers.
- Every kagent-side path stays under `/api`, the only prefix either door proxies
  to the controller. There is deliberately no version probe: kagent serves
  `/version` at its server root, which the derived door's nginx sends to the
  kagent UI (HTML) and which the agentgateway override's `/kagent` prefix never
  matches, so a probe would fail on every healthy installation.
- The base URL is derived per installation as `https://kagent.<baseDomain>/api`
  (the oauth2-proxy-fronted host, whose nginx sidecar proxies `/api/` to
  `kagent-controller:8083`), overridable via
  `agentPlatform.kagent.installations.<name>.apiBaseUrl` — which also acts as an
  allowlist, since kagent is only deployed on some installations.
- The user's per-installation Dex ID token arrives in a
  `backstage-kagent-authorization` header and is promoted to `Authorization:
Bearer` toward kagent, whose `trusted-proxy` auth mode derives the user from
  the `sub` claim. The inbound `Authorization` header already carries the
  Backstage identity, hence the separate header (same approach as
  `muster-backend`).
- Responses are passed through **verbatim** — the `{error, data, message}`
  envelope is not unwrapped and unknown fields are not stripped — so kagent
  schema drift is absorbed by the frontend client rather than needing a backend
  release.
- Transport failures map to typed errors: an oauth2-proxy redirect or a non-JSON
  200 (a sign-in page) becomes a 401 rather than being followed, a missing
  kagent becomes a 404, and DNS/TLS/timeout failures become a 503. Body reads are
  covered by the same mapping, since the abort signal stays armed after the
  headers arrive — a mid-stream abort, a connection reset, or truncated JSON is
  still a 503 rather than an unmapped 500.
- A configured `apiBaseUrl` that is not an absolute http(s) URL is rejected at
  startup with one clear message, instead of failing opaquely on every request.
