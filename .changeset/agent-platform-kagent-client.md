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
- **Per-installation capability negotiation** (`lib/kagentCapabilities.ts`,
  `hooks/useKagentCapabilities.ts`). A cached `/version` probe per installation
  yields named flags (`hasSessionShares`, `canRenameSessionViaPatch`,
  `hasSessionReadOnly`) so components never compare versions inline. The
  supported window is explicit (`MIN_SUPPORTED` 0.9.9, `TESTED_UP_TO` 0.10.0):
  below the floor is flagged but still rendered, above the ceiling proceeds
  optimistically and logs once. A failed or unparseable probe degrades to the
  oldest supported version instead of erroring, and never blocks the session
  query.
- **An `isUserScoped` flag** from a `/me` probe. kagent's `unsecure` auth mode
  ignores the forwarded token and resolves every caller to a shared built-in
  user, so the list would not be "your sessions" — worth detecting rather than
  mislabelling.
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
