---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Add a version-tolerant kagent API client, the data layer behind the upcoming
Agent Platform "Sessions" list. No visible change yet.

kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is already on
v0.10.0-beta9, and each installation is an independent deployment — so the fleet
can run several kagent versions at once. Everything here is therefore keyed per
installation and defensive by default:

- **Tolerant wire → domain boundary** (`lib/kagentSchema.ts`,
  `lib/kagentSessions.ts`). Responses are parsed with permissive zod schemas
  (unknown fields pass through, every field may be absent or retyped) and
  normalized into a stable `KagentSession` the UI consumes, so a schema change is
  absorbed in one function. Rows are validated individually: one malformed entry
  is skipped rather than costing the whole list. Envelope drift is tolerated too —
  `data` absent (Go's `omitempty` on an empty slice), `data: null`, or a bare
  top-level array. `Date.parse`-hostile values and Go zero time
  (`0001-01-01T00:00:00Z`, which browsers render as "Dec 31, 0000") are dropped so
  callers can show a dash.
- **Per-installation capabilities** (`lib/kagentCapabilities.ts`,
  `hooks/useKagentCapabilities.ts`), keyed per installation because each is an
  independent deployment. Currently one observable capability: `isUserScoped`,
  from a cached `/me` probe. kagent's `unsecure` auth mode ignores the forwarded
  token and resolves every caller to a shared built-in user, so the list would
  silently not be "your sessions" — worth detecting rather than mislabelling. The
  probe is non-fatal and never gates the sessions query; until it resolves,
  nothing is claimed either way.

  Capabilities are deliberately **not** derived from a kagent version number.
  kagent serves `/version` at its server root, which neither door we reach it
  through routes to the controller (the derived door's nginx sends `/` to the
  kagent UI; the agentgateway override matches only `/kagent`), and nothing under
  `/api` reports the controller version. Version _tolerance_ does not depend on
  it — that lives in the parsing layer above, which is where it does the real
  work. If version gating is ever needed, probe by behaviour (call a
  version-specific endpoint, treat 404 as "absent") instead.

- **`KagentApiClient`** (`apis/`), registered as `kagentApiRef`. Mints each
  installation's Dex ID token lazily per request so a mint failure degrades one
  installation (the user may be signed in to some and not others), and never
  caches tokens — the plugin's query cache is persisted to `localStorage`, which
  is no place for a credential. Status codes map to the error names the plugin's
  retry predicate and the sessions provider classify on.
- **`lib/installationOidcToken.ts`** extracts the token-minting sequence
  previously inline in `useDeployAgent`, so the deploy flow and the kagent client
  mint identically.

Backed by version-matrix fixtures — including a captured live v0.9.9 response —
asserting that v0.9.9 and v0.10 payloads normalize to identical output and that a
synthetic future version with unknown fields changes nothing.
