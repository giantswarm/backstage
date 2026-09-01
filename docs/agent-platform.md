# Agent Platform

The `agent-platform` plugin (`@giantswarm/backstage-plugin-agent-platform`)
provides the UI for creating and (later) managing kagent agents from Backstage.
It is a re-implementation of the APUI (Agent Platform User Interface) prototype
as native, real-data Backstage pages.

This page documents the **agent-creation flow** (`/agents/new` →
`/agents/new/skills` → `/agents/new/review`) as it stands, and the open work
still ahead.

## Overview of the create flow

Three custom in-context pages, built with **bui** (`@backstage/ui`), driving the
scaffolder engine underneath ("Hybrid C"):

1. **`/agents/new`** — the form (`NewAgentPage`). Installation, identity (name,
   auto-derived slug, description) and configuration (model, system prompt).
2. **`/agents/new/skills`** — skill selection (`NewAgentSkillsPage`). Optional;
   see "Skill discovery" below.
3. **`/agents/new/review`** — review and deploy (`NewAgentReviewPage`). Shows the
   composed manifests, deploys them directly, and offers a manual-install
   fallback.

Each page carries a "Step X of N" label. Only step 1 validates (name, slug,
installation, model); steps 2 and 3 redirect back to it if those are missing, so
a deep link into the middle of the flow can't strand the user.

**Step 2 is conditional.** With no `agentPlatform.skills.repositories`
configured there is nothing to pick and nothing the agent's creator can do about
it (the fix is admin-side config), so the step is skipped: step 1's Continue
goes straight to review, the labels read "of 2", review's "Back" returns to step
1, and a deep link to `/agents/new/skills` redirects to review. `hasRepositories`
comes from config alone, so this decision costs no request.

Cross-page form state lives in `NewAgentFormProvider`. The set of installations
and their models is loaded once by `ModelConfigsProvider`.

### Model selection

`ModelConfigPicker` lists the kagent `ModelConfig` resources found on the
selected installation as selectable cards (native `<button role="radio">`, since
bui's Card button variant is currently broken). The installation dropdown
(`InstallationSelect`) only offers installations that are known to have at least
one `ModelConfig`, resolving them incrementally as the fleet-wide query returns.

`ModelConfigsProvider` owns that fleet-wide query and keeps it cheap:

- **Only reachable installations are queried.** `useReachableInstallations`
  narrows the configured installations to those the app currently considers
  reachable, reading the shared cluster-access status the sidebar warm-up
  maintains (`clusterAccessStatusApiRef` from the `gs` plugin —
  `healthy`/`connecting` are kept, `degraded`/`session-expired`/absent are
  skipped). This stops the query fanning out to unreachable/forbidden clusters,
  each of which otherwise hangs for the full proxy timeout and retries before
  settling. Until any status is known it falls back to all installations. (This
  is the one place agent-platform imports from `gs`; the reachability signal has
  no lighter shared home yet.)
- **API-version discovery is skipped** (`enableDiscovery: false`): we type
  against a single `ModelConfig` version (`v1alpha2`), so the two extra
  discovery round-trips per cluster (and their retry storm) are pure overhead.
- **Failures are surfaced, not swallowed.** Installations that error (unreachable
  or a `403` — listing across all namespaces is admin-only) are exposed as
  `unreachableInstallations` and shown as a warning, so an empty result is
  distinguishable from a failed one. The "No installations with models" message
  only appears when reads actually succeeded and found nothing.

### Skill discovery

Skills are discovered from the GitHub repositories configured in
`agentPlatform.skills.repositories`. A skill is any directory containing a
`SKILL.md` file; its YAML frontmatter (`name`, `description`) drives the picker.

Discovery runs **backend-side** in `gs-backend` (`GET /agent-skills?repoUrl=…`,
`src/agentSkills/discoverAgentSkills.ts`): it walks the repo's git tree
(recursive), finds every `SKILL.md`, and parses the frontmatter, authenticating
with the configured GitHub integration (public repos also work
unauthenticated). The frontend `useSkillCatalog` hook aggregates results across
all configured repositories (one failing repo doesn't fail the rest), and
`NewAgentSkillsPage` renders them as multi-select cards.

Skill selection is its own step because these repositories get large — one
internal repo alone holds 100+ skills across a dozen plugins, which swamped the
create form when the picker was inlined there. The step therefore:

- **Groups by repository, then by subfolder.** `src/lib/skillGrouping.ts` derives
  the subgroup from a skill's path by dropping the skill's own directory, then
  dropping structural container segments (`skills`) — so
  `plugins/gs-base/skills/registries` groups under `gs-base`, while a repo whose
  skills sit at the root has no subgroups and renders flush (no synthetic
  "General" heading). This needs no per-repo configuration.
- **Filters within that grouping.** The search field matches name, description,
  path and repo slug using `matchesQuery` from `ui-react` (token-boundary
  prefix matching, AND semantics — client-side, since the whole catalogue is
  already loaded). Repos and subgroups without matches disappear and the header
  counts show matches, but the structure stays put, so results keep their
  origin as context and the page doesn't relayout on the first keystroke.
  Expansion is **controlled** (`expandedKeys`/`onExpandedChange`) and re-seeded
  to "everything shown is open" whenever the query or the matching repo set
  changes, because bui's `defaultExpandedKeys` only applies on mount. Without
  that, a repo the user had collapsed would keep its matches hidden behind a
  trigger advertising a non-zero count. Between those re-seeds a manual collapse
  sticks.
- **Reports its own output.** A "N selected" count sits next to the search field
  and the review summary names the selected skills, since a query can hide every
  selected card and the values YAML is otherwise the only evidence of them.

`NewAgentPage` also calls `useSkillCatalog()` — not to render anything, but to
start discovery while the user is still filling in step 1 (the query key doesn't
depend on form state, so it's never wasted) and to decide whether step 2 exists.
It is the reason the step usually opens with its catalogue already loaded.

A selected skill maps to a kagent **`spec.skills.gitRefs`** entry — `{ url: repo,
path: <skill dir>, ref: <branch>, name }` — which is what `composeManifests`
inlines into the chart values. (This is the real kagent v1alpha2 shape; there is
no OCI/image skill source in that schema, despite a stale doc comment on the
CRD.) Repo-root skills omit `path`; agents with no skills selected omit the
`skills` block entirely (kagent's `gitRefs` requires ≥1 entry).

### Manifest composition

`src/lib/composeManifests.ts` turns the form into:

- A Flux **`OCIRepository`** (sources the chart) and **`HelmRelease`** (installs
  the agent, with the agent values inlined into `spec.values`). These are joined
  into a single multi-document `combinedManifest` — the source of truth that is
  both previewed on the review page and applied verbatim. The `OCIRepository`
  tracks a **semver range** (`ref.semver: "x.x.x"`) rather than a pinned tag, so
  Flux auto-upgrades the agent to the latest published release (GS "major
  upgrades" convention).
- A standalone `values.yaml` + `helm install` command for the manual fallback.

We deliberately deviate from the prototype's 3-file/ConfigMap model: the
prototype's `HelmRelease` referenced a `ConfigMap` that was never generated, so
we inline the values instead (the common self-contained Flux pattern).

### Chart resolution

Rather than hardcoding a chart version or a default system prompt, `useAgentChart`
resolves both from the published `agent` chart at runtime — reusing the same
gs-backend endpoints the App Deployment scaffolder fields use:

1. `container-registry/tags` → the **latest stable tag** (highest semver
   non-prerelease). Used for the manual `helm install` snapshot and to read the
   default prompt below (the deployed `OCIRepository` itself auto-upgrades via
   the semver range and isn't pinned). Falls back to the configured
   `chart.version` floor.
2. `container-registry/tag-manifest` → the `io.giantswarm.application.values-schema`
   annotation → the chart's `values.yaml` (fetched via `github/raw-content`) →
   its `agent.systemMessage`, which **seeds the form's system-prompt default**
   (until the user edits it). The chart's default is deliberately minimal today
   but can grow without a UI change.

Each step degrades gracefully: the version falls back to config and the prompt
to empty (the user then writes their own).

## Direct apply via scaffolder

Deploying **applies the resources directly** to the selected installation — there
is no pull request. The path:

1. `useDeployAgent` mints the user's per-installation OIDC token the same way the
   `GSOIDCToken` scaffolder field does: `kubernetesApi.getCluster(installation)`
   → `kubernetesAuthProvidersApi.getCredentials('oidc.' + oidcTokenProvider)`.
2. It calls `scaffolderApi.scaffold()` with a hidden catalog template
   (`agent-deployment`), passing the `combinedManifest`, the installation, and
   the token as the `USER_OIDC_TOKEN` secret. The `oidcTokenInstallation` value
   tells the GS scaffolder client which installation backend to route the task
   to.
3. The template runs the **`kube:apply`** action
   (`@devangelista/backstage-scaffolder-kubernetes`, already wired in
   `packages/backend/src/index.ts`), which does `yaml.loadAll` +
   read-then-patch-or-create per resource.
4. On success the user is sent to the scaffolder task page for the live apply
   logs.

### Shared OCIRepository per namespace

The `OCIRepository` is named after the chart (`agent`), **not** the agent — so
every agent deployed into a namespace generates the same one, while each agent
gets its own `HelmRelease` (named after the slug). The model is therefore **one
shared `OCIRepository/agent` per namespace, many HelmReleases**.

This is safe on re-deploy: `kube:apply` reads each resource and patches it if it
exists (else creates it), so a second agent's deploy re-applies an identical
`OCIRepository/agent` as a no-op patch — no `AlreadyExists` error, no duplicate.
It works because all agents pin the same chart source and `semver: "x.x.x"`
range, so the shared source is uniform.

Two consequences to keep in mind:

- **Deletion must not remove the shared OCIRepository** while others still use it.
  Deleting an agent removes only that agent's `HelmRelease`, and takes
  `OCIRepository/agent` with it only after confirming no other `HelmRelease` in
  the source's namespace references it (see "Deleting an agent"). Every
  uncertainty resolves to keeping it.
- **Per-agent chart versions aren't expressible.** The sharing relies on every
  agent tracking the same range. If a specific agent ever needed a different
  chart version, it would need its own OCIRepository (e.g. named after the slug).
  Not a concern under the current always-latest approach.

### The `agent-deployment` template

`catalog/templates/agent-deployment/template.yaml` is a thin wrapper around
`kube:apply` (tagged `hidden` so it stays out of the `/create` list). It applies
the manifest verbatim, so what the review page shows is exactly what is applied.

> **Note:** `/catalog` is gitignored — the copy there is a **local-dev artifact**
> only, like `app-deployment`; register it via `catalog.locations` in
> `app-config.local.yaml` (see `app-config.local.yaml.example`). Real deployments
> load the template from the external
> [`giantswarm/backstage-catalogs`](https://github.com/giantswarm/backstage-catalogs/tree/main/templates/agent-deployment)
> repo, where it is published. Keep the two in sync when changing it.

### Namespace

The `HelmRelease`, `OCIRepository`, and (via an unset `targetNamespace`) the
chart's output all land in **the selected `ModelConfig`'s namespace** (e.g.
`kagent`). This is derived, not configured: the namespace already exists, kagent
watches it, and it co-locates the agent with the model it uses. This avoids both
a hardcoded namespace and the GitOps-managed `flux-giantswarm` namespace (which
would risk pruning of ad-hoc, UI-applied resources).

### Flux multi-tenancy ServiceAccount

GS enforces a Flux multi-tenancy admission policy: a `HelmRelease` in a **tenant**
namespace (which the ModelConfig namespace is) is rejected unless it sets
`spec.serviceAccountName`. (`flux-giantswarm` is exempt; `OCIRepository` is not
covered.) The generated `HelmRelease` sets it from
`agentPlatform.fluxServiceAccountName`. This is currently a **placeholder** — see
the open TODOs.

## The Sessions tab

`/agent-platform/sessions` lists the signed-in user's kagent chat sessions across
the fleet, with a composer above it that **starts a new one** (see "Starting a
session"). A session opens into its detail page, where it can be **renamed** and
**deleted** (see "Renaming a session" and "Deleting a session"); the list rows
themselves carry no actions.

### Why it needs a backend proxy

Unlike agents and model configs, kagent **sessions are not Kubernetes
resources** — they live in kagent's Postgres and are served over the controller's
HTTP API, so the Kubernetes proxy the rest of the plugin uses cannot reach them.
Two things then force a backend hop, which `agent-platform-backend` provides:

- The browser cannot call `kagent.<baseDomain>` cross-origin.
- kagent runs `controller.auth.mode: trusted-proxy` and derives the user from the
  `sub` claim of an `Authorization: Bearer` JWT — but inbound, that header carries
  the Backstage identity. So the user's per-installation Dex ID token travels in a
  separate `backstage-kagent-authorization` header and is promoted to
  `Authorization` by the proxy. Same approach as `muster-backend`.

The URL is derived per installation as `https://kagent.<baseDomain>/api` (the
oauth2-proxy-fronted host whose nginx sidecar proxies `/api/` to
`kagent-controller:8083`), overridable via `agentPlatform.kagent.installations`.
Everything stays under `/api`: that is the only prefix either ingress routes to
the controller, which is also why there is **no version probe** — kagent serves
`/version` at its server root, where the derived door's nginx answers from the UI
and the agentgateway override's `/kagent` prefix does not match.

### ⚠️ Prerequisite: kagent's oauth2-proxy must accept Backstage's audience

kagent's oauth2-proxy runs with `skip-jwt-bearer-tokens: true`, which accepts a
bearer JWT **only when its audience matches oauth2-proxy's own `--client-id`**.
Backstage mints per-installation tokens for its _own_ Dex client
(`aud: [dex-k8s-authenticator, <backstage client>]`), while kagent's oauth2-proxy
uses a separate Dex client. Unless the two are reconciled, every session read
returns **401** and the tab shows "Couldn't read N installations".

The fix is platform-side: add Backstage's Dex client id as an
`--oidc-extra-audience` on kagent's oauth2-proxy (neither the charts nor the
install configs set one today).

For **local development** before that lands, point an installation at the
agentgateway door instead, which enforces no auth of its own and passes the bearer
through to kagent's `trusted-proxy` mode:

```yaml
agentPlatform:
  kagent:
    installations:
      <installation>:
        apiBaseUrl: https://agentgateway.<baseDomain>/kagent/api
```

Local dev only — that door is unauthenticated on GS installations and must never
be the default. (Worth reporting separately: it exposes kagent's whole REST + A2A
surface with no enforcement, because the `AgentgatewayPolicy` JWT check only
renders under `oauthMode: validate` and only targets `/mcp`, while GS runs
`passthrough`.)

**Related open question.** kagent scopes with `WHERE user_id = <userIdClaim>` and
GS sets `userIdClaim: sub`, but existing sessions have been observed keyed by
email. If the `sub` Backstage sends doesn't match what kagent recorded, the list
will be correct-but-empty rather than erroring. `GET /kagent/me` reports the
identity kagent resolved and is the way to tell the two apart.

### What the list can and cannot show

A kagent `Session` carries only `id`, `name?`, `user_id`, `created_at`,
`updated_at`, `deleted_at?`, `agent_id?` and `source?`. So the columns are
Session, Agent, Installation, Started, and Last activity — and the prototype's
status, trigger, duration, cost, tokens, team, linked task, results and evaluation
columns have no backing data at all. The nine-stat summary band derives from those
same absent fields, so it is out too.

Two consequences worth knowing:

- **Only "your" sessions exist as a concept.** kagent lists with
  `WHERE user_id = <sub>` and exposes no cross-user endpoint, so the prototype's
  Mine/Watched/All scope tabs reduce to a single implicit scope.
- **Titles are short and lossy.** kagent derives them from the first message and
  truncates to 20 characters (`"What issues are assi..."`), and the full text is
  unrecoverable — so the Agent column carries much of a row's meaning.

#### Session ids come in two shapes, and neither is ours

Nothing here generates a session id, but the fleet holds two formats and it is worth
knowing why before anyone writes a validator or a route guard against one of them.

A session id **is** its A2A `contextId`, and whoever first names that context decides
the format:

- **Dashed UUIDv7** — `01a0587c-3955-790d-bf5f-e3e8427cdaa4`. What kagent generates
  when a client calls `POST /api/sessions` without an `id`: `HandleCreateSession` falls
  back to `a2a.NewContextID()`, which is `uuid.NewV7().String()` (a2a-go v2.4.0). This
  plugin and the kagent UI both take that path. The `01a0…` prefix is a 48-bit
  millisecond timestamp, so these sort by creation time.
- **64 hex characters, no dashes** —
  `986c786b60148810eff0757e49d56fc72f315609c715d392f97ad0df6fcb8cc5`. klaus-gateway's,
  and **deterministic rather than random**: `SynthesizeContextID` in its
  `pkg/channels/contextid.go` is a SHA-256 over the five routing dimensions (channel,
  channel id, user id, thread id, agent ref). That is how a Slack thread resumes the
  same kagent session without klaus-gateway storing any mapping. It only ever sets
  `contextId` on the A2A message and never calls `POST /api/sessions`, so kagent's
  generator never runs for it.

So an id is **opaque**: never parse one, never assume hex or a UUID, and never derive
anything from its shape. This code only ever `encodeURIComponent`s it.

One asymmetry follows from the split, and it is why the empty-session TODO exists: a
deterministic id can be recomputed after a lost response, a generated one cannot. If
our create succeeds but its response never arrives, the session is orphaned — so
`createSession` fails loudly and says to check the list, rather than inventing an id.

### Fleet behaviour

Each installation is an independent kagent deployment, so reachability, auth mode,
and availability all vary per installation:

1. `useReachableInstallations` narrows to installations the app considers
   reachable, so the fan-out doesn't hang on unreachable clusters.
2. `GET /kagent/installations` says which of those the backend can reach kagent
   on. **The session queries wait for this**, deliberately: kagent runs on only a
   couple of installations, and querying the rest would fire a doomed request each
   — every one of which mints that installation's Dex token first. One cached call
   up front is much cheaper than N wasted ones per cold load. If the allowlist
   itself fails, we fall back to the reachable set so a backend hiccup doesn't look
   like an empty session list.
3. One react-query per installation, so each loads, caches and fails
   independently. Rows are merged and re-sorted across the fleet, each tagged with
   its installation.
4. `isLoading` is true only while _no_ rows exist; once any installation answers,
   further loading shows as a thin progress bar so a slow cluster never blanks the
   table.

Failures are classified per installation, and the line is drawn between **absent**
and **unwell** rather than by status code alone:

- **Silent** — `404`, which the backend uses for everything meaning "no kagent API
  here": kagent's own 404, an unknown-installation `400`, and connection-level
  failures (DNS, TLS, connection refused). Nothing is deployed there, which is the
  common case fleet-wide and not actionable.
- **Reported** via `UnreachableInstallationsAlert` — everything else, including a
  `5xx`/`429` from kagent, a request that times out, and a response whose body
  can't be read. kagent answered and failed in all of those, so it is deployed and
  unwell. Sharing an error with "unreachable" would let a degraded installation's
  sessions disappear from the merged list with no alert and nothing logged —
  indistinguishable from "you have no sessions there".

The same applies to responses that are nominally successful: an in-band
`{error: true}` on a `200`, or a `data` that is no longer an array, both throw so
the installation is reported rather than contributing an innocuous empty list. A
partial read (some rows unparseable) does _not_ throw — the rows we could read are
still shown, with a console warning recording what was dropped.

**Why the status codes matter beyond classification.**
`MiddlewareFactory.error()` logs at `error` for any status `>= 500`, and the root
logger forwards `warn`/`error` to Sentry. The Sessions tab queries every reachable
installation, so on a fleet where kagent runs on two of fifteen, thirteen answer
"no kagent here" on every page view — twice over with the identity probe. Returning
a `5xx` for that would raise ~26 Sentry events per page view per user, split into
one issue per installation name. Hence `404` for the expected case, and `500`
reserved for the rare, actionable one. Logging the cause at `debug` in the client
does not help: the throw is what the middleware logs.

### Caching: user-scoped data is never persisted

The plugin's `QueryClientProvider` persists its cache to `localStorage` for an
hour, which is right for the Agents and ModelConfig lists — that is installation
state, identical for every user, and caching it across reloads is the point.

Sessions are different: the rows are one user's chat titles, the identity probe
caches their subject (an email), and a session's tasks are the whole conversation
including tool arguments and results. Those query keys are therefore excluded from
persistence via `dehydrateOptions.shouldDehydrateQuery`, so they live in memory
only. Without that, on a shared workstation the data would outlive sign-out on
disk, and `PersistQueryClientProvider` would rehydrate the previous user's sessions
for the next one — under the same origin and key, and with `staleTime: 60_000` an
entry under a minute old would not even be refetched.

`session-tasks` has a second, independent reason: **size**. A real 4-turn session's
tasks were ~500 KB against a localStorage budget of roughly 5 MB for the whole
origin, so a handful of opened conversations would evict everything else — including
the fleet lists this persistence exists for in the first place.

The filter composes with `defaultShouldDehydrateQuery` rather than replacing it, so
the library's "only persist successful queries" rule still applies.

### User scoping

kagent's `unsecure` auth mode ignores the forwarded token and resolves every
caller to a shared built-in user, which would silently present a shared list as
the user's own. A `/kagent/me` probe detects this per installation and the UI warns
about the affected installations.

The flag is **tri-state**, and the distinction matters: `undefined` means "we don't
know" — the probe hasn't resolved, or kagent reported no subject, which is
reachable on a healthy deployment since `/api/me` returns the token's claims
verbatim and an IdP need not emit `sub`. The UI warns **only** on an explicit
`false`, so an odd-but-working installation isn't flagged.

### Version tolerance

kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on v0.10.x, and the
fleet can run a mix. Tolerance therefore lives in the parsing layer
(`lib/kagentSchema.ts`, `lib/kagentSessions.ts`) rather than in version detection:

- Permissive zod schemas — unknown fields pass through, every field may be absent
  or retyped, and rows are validated one at a time so a single bad entry is
  skipped rather than costing the list.
- Envelope tolerance: `data` absent (Go's `omitempty` on an empty slice — this is
  what "no sessions" looks like on the wire), `data: null`, or a bare array. An
  in-band `{error: true}` on a 200 is reported rather than becoming a silent empty
  list.
- Go zero time (`0001-01-01T00:00:00Z`, which browsers render as "Dec 31, 0000")
  and unparseable timestamps are dropped so the UI shows a dash.

Backed by version-matrix fixtures in `lib/__fixtures__/`, including a captured
live v0.9.9 response, asserting v0.9.9 and v0.10 payloads normalise identically.

`source === 'agent'` (A2A subagent) sessions are excluded — though note live
v0.9.9 responses omit `source` entirely, so this is forward-compatibility rather
than active filtering today.

## The session detail page

`/agent-platform/sessions/<installation>/<id>` shows one session: its metadata, a
stats strip, and the conversation. The installation is in the path because it is
part of the session's identity — kagent ids are only unique within one.

A session can be **deleted** from the kebab menu (see "Deleting a session"). kagent
can also rename and continue a session, and the prototype offers both — neither is
wired up.

### Two reads, and why the events are ignored

| Endpoint                 | Used for                                                |
| ------------------------ | ------------------------------------------------------- |
| `…/sessions/:id?limit=1` | the session object: title, agent, timestamps, existence |
| `…/sessions/:id/tasks`   | the conversation, its state, and token usage            |

The conversation comes from **tasks**, which is what kagent's own UI renders from.
The `events` array on the first response is ignored entirely, and `limit=1` keeps it
off the wire. kagent's Go type calls each event's `data` a
`JSON-serialized protocol.Message`, which suggested events could supply the
per-message timestamps A2A messages lack. A real gazelle session disproved it: the
decoded value is an **ADK event** (`author`, `content`, `invocation_id`, `partial`,
`timestamp`, …) with no `messageId` at all, so nothing correlates with task history.
On that session the events were 591 KB against 261 bytes of session metadata.
(`limit` must be `1`, not `0` — kagent gates its LIMIT clause on `opts.Limit > 0`,
so zero reads as _unlimited_.)

**Consequence for the UI: timestamps are per turn, not per item.** A task's
timestamp is the finest granularity that exists, so the timeline shows it once per
turn rather than repeating it on every entry, which would imply precision we do not
have.

### Refreshing

Both reads poll, on different cadences (`lib/kagentSessionPolling.ts`):

| Read             | Interval                                                                            |
| ---------------- | ----------------------------------------------------------------------------------- |
| the session      | a flat 60 s                                                                         |
| the conversation | **10 s** while the newest task is in an active A2A state and recent, 60 s otherwise |

The session object is title, agent and timestamps, none of which move while an agent
works, so it gets no fast tier — it polls at all only so a session renamed or deleted
elsewhere stops looking current. The conversation gets the two tiers, decided from
the data already in hand, exactly as `getAgentRefetchInterval` does for one agent
(see "The agent detail page").

**There is nothing cheaper to poll.** kagent's API serves no `HEAD` — every route is
registered for a single method on a gorilla/mux router, which matches methods
exactly — and sets no `ETag`, `Last-Modified` or `Cache-Control` (`RespondWithJSON`
in `go/core/internal/httpserver/handlers/helpers.go` marshals and writes; the
middleware chain only sets `Content-Type`). So there is no conditional GET to make
"has this changed?" cheap, and a full re-read is the only probe available. The
closest thing is the session object's `updated_at`, which tracks task-status writes
to the millisecond — a future optimisation could gate the expensive read on it, but
only once someone has confirmed kagent bumps it per appended event rather than only
on state transitions. If it is the latter, a gated design would show nothing for the
whole duration of a turn.

That is also why the fast tier is **10 s and not the agents' 5 s**: this one moves
the whole conversation, ~500 KB for a four-turn session, re-parsed row by row
through `a2aTaskWireSchema` and then deep-compared on the main thread. A turn takes
tens of seconds, so nothing reads as less live for it.

**The age bound is 5 minutes, against the agents' 3.** Both exist for the same
reason — an agent that died mid-turn without writing a terminal state would
otherwise pin the fast tier for as long as the tab stays open — but they are
calibrated to different things: the agents' bound tracks a controller reconcile
loop, this one tracks an agent _turn_, which routinely runs minutes when there are
many tool calls. A 3-minute bound would back off in the middle of exactly the run
the page was opened to watch.

The bound is also what handles `input-required` and `auth-required`. Those states
are active — the session may still produce output — but they wait on a human, and
this page offers no way to reply. They start on the fast tier, relax once nobody has
answered inside the window, and re-engage on their own when someone answers
elsewhere and the newest task's timestamp advances.

**A terminal session relaxes to 60 s rather than stopping.** Unlike a finished
workflow execution, a kagent session is not immutable: it can be continued, renamed
or deleted from another client. Stopping would freeze the page for exactly the case
this polling exists to fix. 60 s equals the query client's `staleTime`, so nothing
is refetched that the client still considers fresh.

Polls only fire while the tab is **visible** — `refetchIntervalInBackground` defaults
to `false`, and react-query's focus manager keys off `document.visibilityState`, not
window focus, so a visible-but-unfocused window keeps polling. Verified on gazelle:
nothing was requested across 80 s hidden, and the interval resumed by itself
afterwards.

Going **offline** is different again, and quieter than it looks: react-query's
default `networkMode: 'online'` _pauses_ these queries rather than failing them, so a
disconnected browser makes no request, raises no error and shows no warning — the
page just stops updating until the connection returns, at which point the interval
resumes on its own. Also verified on gazelle.

An unchanged response costs no re-render: react-query's structural sharing returns
the previous reference when the payload is deep-equal, so the `useMemo`s that rebuild
the timeline do not re-run.

**A failed refresh does not replace the page.** react-query keeps `data` and sets
`error` on a failed _refetch_, and the query client deliberately does not retry
`ServiceUnavailable`/`Unauthorized`/`Forbidden` — so treating any error as fatal
would let one proxy hiccup blank a conversation someone is reading, for up to a
minute. The fatal branch is gated on having no session at all; an error with one in
hand shows a warning notice above the page instead. That notice is a local `Alert`
rather than the shared `ErrorsProvider`/`useShowErrors` notice the agent detail page
uses, because the sessions router mounts no `ErrorsProvider` and adding one would
mean splitting this page into wrapper and content for a one-line message.

**"Keep what you have" is not the same as "render whatever is in hand", and three
cases pull them apart.** The two reads fail independently, so each needed its own
answer:

- **The conversation never loaded.** A tasks read that fails on _first_ load leaves
  the timeline, turn count and tokens at their zero values while the session read
  succeeds. Rendering that would state "no activity", `Turns 0` and "no messages
  yet" about a session with a full conversation. The hook exposes `hasConversation`
  (`tasksQuery.data !== undefined`) and the page keeps the fatal branch when it is
  false — absent is not empty. A session that genuinely never ran reads as `[]`,
  which is data, and still renders as "no activity".
- **A poll returns a 200 with no readable session.** `getSessionDetail` resolves
  `undefined` for that, and react-query _rejects_ an `undefined` resolve — the query
  errors with `[…query key…] data is undefined`, which leaked a raw query key into
  the UI and made the `isSuccess && !data` branch unreachable. The query function
  now coerces to `null`, which react-query stores. On top of that, an empty read
  only means "no such session" **before** one has been read: once the page is
  showing a conversation, the same answer means unreadable, not deleted — an expired
  oauth2-proxy serving an HTML sign-in page under a 200 is the realistic trigger,
  and telling someone their session "may have been deleted" for that would be a lie.
  A genuine 404 still counts at any point, since that is how a delete elsewhere
  shows up.
- **A delete is in flight.** `refetchType: 'none'` governs invalidation-driven
  refetches only; a scheduled interval tick is neither, so it could land in the
  window between kagent accepting the delete and the caller navigating away, 404 and
  flash "Session not found" at someone who just deleted the session deliberately.
  The page passes `enabled: !isDeleting && !isDeleted` into the hook, which stops
  both reads outright for the duration.

### What the timeline shows

Built by `lib/kagentTimeline.ts` from task history. Conversation messages render in
full; the agent's internal work is collapsible, with a Hidden/Collapsed/Expanded
control — collapsed by default, because the working is the point of the screen but a
wall of tool payloads is unreadable.

Presentation follows the conventions of chat surfaces, shared with the AI chat
plugin's visual language. The user's messages are right-aligned bubbles and
deliberately **not** markdown — prompts quote logs and `#`-prefixed lines that must
stay the characters typed. The agent's side of a turn opens with its avatar and
name once, and its prose renders as GFM markdown (tables, code blocks, entity-aware
links). Internal work renders as one-line disclosure rows whose payloads are
JSON-highlighted, with JSON hiding inside result strings inlined rather than shown
as a wall of `\"` escapes. The composer docks to the bottom of the viewport, and
the page follows a streaming reply only while already scrolled to the end — never
yanking someone who scrolled up out of what they were reading.

| Entry                | Where it comes from                                                        |
| -------------------- | -------------------------------------------------------------------------- |
| User / agent message | `role` plus text parts, rendered as markdown                               |
| Reasoning            | a text part flagged `{adk,kagent}_thought`                                 |
| Tool call            | a `function_call` data part, with its `function_response` folded in        |
| Delegation           | a `function_call` whose name contains `__NS__`, plus the child's own usage |
| Approval             | ADK's `adk_request_confirmation`, with the user's verdict                  |

**Calls through Muster are unwrapped.** Agents reach most MCP tools via muster's
`call_tool`, so untreated every row reads `call_tool` with the real tool buried in
the arguments — the problem reported in
[klaus-gateway#163](https://github.com/giantswarm/klaus-gateway/issues/163). The
parser looks through the wrapper (`unwrapProxiedCall`), so the row names the tool
actually invoked and carries a `via Muster` badge; on a real gazelle session that
unwrapped 7 of 17 calls.

Unwrapping requires the payload to be _nothing but_ the wrapper: a non-empty `name`,
and no key besides `name` and `arguments`. That second half is what keeps the
degradation honest — keying on `name` alone would mean that if muster renamed or
nested the inner arguments, the row would still name the real tool while its
arguments silently became `undefined`, leaving an entry with nothing to expand. As
written, an unfamiliar key means the call degrades to showing the proxy, payload
intact, rather than being partly lost. `{ name }` with no `arguments` still unwraps:
that is an argument-less proxied call, and there is nothing there to lose.

Approvals are deliberately **not** governed by the activity control: an approval
records the _user's_ decision, so hiding it would erase the trace of their own
action rather than the agent's working.

Two things real payloads taught us, both now relied on: kagent repeats each user
message under the **same `messageId`** on every turn, so the session-wide dedupe is
required rather than defensive; and one message can carry prose plus several tool
calls, always text first.

**A message the parser cannot read is counted, not hidden.** `skippedMessages`
counts history entries that failed the schema outright — artifact and status updates
are deliberately excluded, being healthy entries we simply have no renderer for —
and the timeline warns "N messages could not be read". That warning renders even
when _every_ entry failed and there are therefore no items at all; otherwise the one
case it exists for would report as an ordinary empty session.

### What it cannot show

kagent stores none of this, so the prototype's remaining fields have no data behind
them and should not be re-added speculatively: **cost**, **tokens/second**,
**context-window usage**, the owning **team**, the **trigger** that started the
session, a **linked work item**, produced **results**, and **evaluation**.

Delegation entries are inert — the response does not reliably carry the child
session's id, and subagent sessions are filtered out of the list anyway.

### The stats strip

`Turns · Duration · Input tokens (billed, cumulative) · Output tokens`.

**Input tokens are labelled "billed, cumulative" on purpose.** Every model call
re-sends the whole context, so a 4-turn session with a large tool catalogue reached
**1.4M prompt tokens across 14 calls** (3.9k–144k each). That is genuine billed
usage and kagent's own UI sums it identically — but unlabelled it reads as a bug.

There is deliberately **no combined total**: input and output tokens are priced
differently, so their sum is not a number anyone acts on.

One kagent quirk to know: `adk_usage_metadata` carries only `promptTokenCount` and
`candidatesTokenCount` on some sessions — no `totalTokenCount` at all — so a total
is derived from the parts when kagent reports none. A reported total still wins,
since a model billing thinking tokens separately counts them in the total but in
neither part.

**Duration is wall-clock**, `updated_at − created_at`: kagent records no per-turn
durations, so it includes however long the user was away between turns.

### Timestamps are absolute here, relative in the list

The detail header and the turn markers show `28 Jul 2026, 10:07 UTC`, not "1 day
ago". Both ends of a session usually fall on the same day, so the relative form
rendered "Started 1 day ago · last activity 1 day ago" for a session that took
three minutes, and printed "1 day ago" identically on every turn marker — hiding
the progression the timeline exists to show. The list keeps the relative form,
where scanning for recency is the point.

### Renaming a session

`useRenameSession` + `SessionRenameDialog`, reachable two ways: a `Rename session…`
item in the kebab, and the page title itself, which is a real `<button>` stripped of
its chrome rather than a click handler on the heading — so it is keyboard-reachable
and announced as something you can press. Both open the **same** dialog, which is why
its open state lives on the page rather than inside the actions menu the way the
delete's does.

The title carries a **"Rename session" tooltip**, because the hover underline says
"this does something" without saying what, and every other thing on the page is inert
text. It uses MUI's tooltip rather than bui's: bui wraps react-aria's
`TooltipTrigger`, which only wires up its own focusable components, and this trigger
is a bare `<button>` so it can inherit the heading's typography. Same fallback
`CodeBlock/CopyButton` already makes.

Worth doing because kagent's titles are derived from the first message and truncated
to 20 characters, so a session that mattered is filed under half a sentence.

**kagent's rename endpoint does not rename on the version the fleet runs.** This is
the whole reason the implementation looks the way it does, and neither the route table
nor kagent's own docs give it away. `PUT /api/sessions/{session_id}` exists on v0.9.x
and is registered (`.Methods(http.MethodPut)`), but `HandleUpdateSession` there:

- requires **both** `name` and `agent_ref`, rejecting either omission with a 400;
- never reads `{session_id}` — it looks the session up by `*sessionRequest.Name`,
  i.e. it treats the new name as the id;
- assigns only `session.AgentID`. `session.Name` is never written.

It was fixed in v0.10.0-rc1, which reads the path param and applies a partial update.
GS pins **0.9.9** (`agent-platform`'s `values.yaml`), so on every installation we
run today, the correct endpoint is inert.

**So the write goes through the session upsert instead, but only after the PUT has
said it must.** `POST /api/sessions` with an existing `id` lands on `StoreSession`,
an upsert on `(id, user_id)` that does write `name` — and the SQL is identical in
v0.9.9 and v0.10.0-rc1. Echoing the session's own `agent_id` back as `agent_ref`
round-trips exactly, because kagent's `ConvertToPythonIdentifier` only rewrites `-`
and `/`, neither of which survives in an already-encoded id.

**Only a 400 enters the fallback, and it means "this kagent predates the fix" —
nothing more.** It is tempting to also read the PUT's status as telling us whether
the session still exists. It does not: v0.9.x rejects the missing `agent_ref`
_before_ it looks anything up, so a live session and a deleted one both answer 400,
and the 404 that would separate them is reachable only on v0.10+ — which is to say,
never on today's fleet. Everything else (401, 403, 404, 5xx) is a real failure and is
surfaced as one.

**The read-back, not the status, is what enforces "never create".** Before writing,
the fallback fetches the session (`GET /sessions/{id}?limit=1`) and gives up if it is
not there. Without it the upsert — which _inserts_ when nothing conflicts — would
resurrect a session someone had just deleted, under its old id.

That read is also what makes the echoed fields trustworthy. The upsert overwrites
`agent_id` and `source` from whatever it is sent, so both are taken from kagent
rather than from the browser: a stale, unparsed or simply absent client value would
otherwise blank a column the user never asked to touch. Note v0.9.9 _does_ serialize
`source` when it is set (`Source *SessionSource` with `json:"source,omitempty"`), so
its absence from our fixtures means those sessions have it null — not that the
version cannot report it.

Every way the fallback can still fail, it fails before writing, and each is a **4xx**
rather than an upstream failure: the session is gone (404), it has no agent (409),
kagent cannot resolve that agent (409), or a sandbox-workload agent already holds a
session (409). None is actionable, and on a fleet where every installation takes this
branch a 5xx would mean a standing Sentry issue per case — see "Logging & error
reporting" in CLAUDE.md.

`updated_at` does move, so a renamed session rises to the top of the list — correct
for an edit.

**All of this is temporary.** The fallback — `KagentClient.updateSessionName`'s POST
branch, its `getSessionRecord` read-back, the `badRequest`/`conflict` opt-ins, and
the tests covering them — comes out when no installation runs kagent v0.9.x, leaving
the PUT alone. It is marked `TODO(kagent-0.9)` throughout, so removing it is one grep.
Our own route takes nothing but the name, so it needs no change when that happens.

Unlike the delete, the invalidations **refetch** rather than using
`refetchType: 'none'`: nothing navigates away, so the page has to show the new name.
Both are awaited inside the mutation, so the dialog closes onto data that has caught
up. The name is trimmed, required, and capped at 255 characters — a bound of ours,
not kagent's (`session.name` is unbounded `TEXT`), enforced in the backend route as
well as the dialog.

Verified against the kagent source at both `v0.9.9` and `v0.10.0-rc1`.

### Deleting a session

`useDeleteSession` + `SessionDeleteDialog`, offered as a `Delete session…` item in
the kebab — the first write path on the kagent REST side, so
`agent-platform-backend` grew a `DELETE /kagent/sessions/:sessionId` route and its
client a method parameter to go with it. Everything about the transport is otherwise
the reads' machinery reused: same installation resolution, same forwarded Dex token,
same status mapping.

**There is no permission check to make, which is why there is no gating.** Unlike
the agent delete — three conditions and a `SelfSubjectAccessReview` — a session is
not a Kubernetes object, and kagent derives the acting user from the forwarded token
alone (`GetUserID` → `GetPrincipal`). There is nothing to ask in advance and nothing
to withhold the affordance for, so the item is always offered on a session that
loaded. The forwarded token is correspondingly **required** by the backend route:
without one, a controller in `unsecure` mode would delete the shared default user's
session on behalf of nobody.

**kagent's delete is soft, and both halves of that matter.** The statement is
`UPDATE session SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at
IS NULL`, and every read filters `deleted_at IS NULL` — the session's row, events and
tasks all survive on kagent's side while disappearing from every API response. So
"deleted" is total as far as this UI is concerned and there is no undo anywhere in
it, but it is not erasure, and the dialog says exactly that rather than picking one
of the two and being wrong about the other.

**A delete that changed nothing still answers 200.** The statement is an `:exec`, so
zero affected rows is not an error: a session that never existed, was already
deleted, or belongs to another user all succeed silently. Nothing here tries to
detect that — a resolved promise means "kagent accepted this", and the invalidated
list is what shows the truth a moment later. It also means there is no 404 path to
handle on the write side, and no "already gone" case to special-case.

**On a non-user-scoped deployment the dialog adds a line.** `isUserScoped === false`
(from the `/me` probe — see "User scoping") means kagent ignores the forwarded
identity and serves one shared user, so the session on screen may have been started
by someone else. It warns rather than withholding the action: kagent authorizes the
call either way, and the person reading is the one who knows whose session it is.
An unresolved probe claims nothing.

**Cache handling has one non-obvious half.** The sessions list key
(`['agent-platform', 'kagent', 'sessions', <installation>]`) is invalidated normally,
so the list the user lands back on is correct. Note this reaches the Sessions tab
only: `useAgentSessions` reads the same key for the agent page's recent-sessions
card, but each tab's router mounts its own `QueryClientProvider` with a fresh
`QueryClient`, so that is a different cache. It needs nothing — a fresh client starts
empty and these keys are never persisted, so the card refetches when the Agents tab
mounts. This session's own two reads are invalidated
with **`refetchType: 'none'`**: the detail page is still mounted at that moment, so
refetching would race the navigation with a request that now 404s and flash "Session
not found" at someone who just deleted it deliberately. Stale-without-refetch leaves
a later visit to the same URL to revalidate and land on the not-found state properly.

On success the user goes back to the sessions list with a toast that says
**"deleted"**, in the past tense — unlike the agent's "Deleting", because kagent's
delete is synchronous and nothing is still settling behind it. On failure the dialog
stays open and shows the message, with no toast, since the user is still looking at
the modal. The confirmation itself is `ConfirmDialog` from `ui-react`, the same
component the agent delete uses.

Verified against the kagent source at both `v0.9.9` (what the fleet runs) and
`v0.10.0-rc1`: the handler, the SQL and the 200-with-envelope response are identical
in both.

### Continuing a session

`SessionComposer` + `useSendMessage`, at the foot of the page.

**A session cannot send anything.** kagent's session endpoints hold history only;
talking to an agent is A2A JSON-RPC `message/send` to
`POST <apiBaseUrl>/a2a/<namespace>/<name>` with `contextId` set to the session id,
which is the only link between the two. So this is a different endpoint family from
the rest of the proxy, and the route is `POST /kagent/sessions/:sessionId/messages` —
session-shaped, because the session is what the user is looking at. The JSON-RPC
envelope is built in `KagentClient`, so the frontend never learns A2A.

**The agent's namespace and name come from the `Agent` resource, never from decoding
`agent_id`.** kagent's encoding rewrites every `-` to `_`, so decoding cannot tell an
original underscore from a rewritten hyphen — an agent whose name contains one would
resolve to an agent that does not exist. `SessionRow` therefore carries
`agentNamespace` next to `agentTechnicalName`, and a session whose agent matched no CR
has no addressable agent at all.

**`message/send` answers only when the agent has finished.** Verified against 0.9.9 on
gazelle: the reply is the finished task (`result.kind === 'task'`, with `status.state`
and the full `history`).

**Waiting that out is neither possible nor necessary.** Gazelle's
`agent-platform-connectivity-ui` HTTPRoute carries an Envoy `BackendTrafficPolicy` with
`requestTimeout: 60s`, so any turn of substance is cut off with a **502** long before it
finishes. And **the turn survives the cut**: observed live, an agent answered a message
whose own request had already died with a 502.

Since the turn survives, waiting buys nothing but a held-open socket, and
`agentPlatform.kagent.turnTimeoutMs` is deliberately **short — 30 seconds**. That
number is not about how long a turn may take; it is chosen to lose a race. The
browser's request traverses a door of its own in front of _Backstage_, and if that door
fires first the frontend gets a 502/504 that nothing here can turn into "still
running", because this process never got to answer. At 30 s we always answer before a
60 s door. (Gazelle's Backstage route happens to set `requestTimeout: 0s`, disabling
it — but the send path must not depend on that being true everywhere.) It is also short
enough that a genuine rejection still surfaces inline.

So a lost connection is not a failed message, and the client does not guess — **it goes
and looks**. On a 502/504, its own timeout, **or a socket that simply died**,
`sendMessage` re-reads `GET /sessions/<id>/tasks` and checks whether the `messageId` it
generated is in the history. Present means the turn was dispatched and is running,
which answers **202**; absent, or unreadable, keeps the original failure. "Cannot tell"
is deliberately not read as "it worked" — that would swallow a real outage.

That third case needs care. `request` maps _any_ non-timeout fetch rejection to a 404,
because on a fleet where most installations run no kagent that is the normal outcome and
must stay off the 5xx path — but the same branch catches an Envoy drain or a TLS reset
mid-turn. Those are marked as transport-borne so a send verifies them, while kagent's
_own_ JSON 404 for an agent that does not exist stays a decision. Decisions are never
verified: not a 401, a 403, a rejected request, nor the JSON-RPC case below.

**A JSON-RPC failure arrives inside a 200.** A2A is JSON-RPC, so an invalid parameter,
an unsupported operation, a task-store failure or an agent whose server is not ready
comes back as `{"jsonrpc":"2.0","error":{…}}` with a 200 — and that `error` is an
_object_, where kagent's REST envelope uses the boolean `true`. Checking only for the
boolean let every one of these through as a successful send, with a specific
consequence: the caller drops its optimistic copy, the invalidated read returns no new
task, and **the message simply vanishes from the page** with the only record of why in a
body nobody read. Both shapes are now read, and the check sits outside the verification
above, since a rejection is a decision and must not come back as a turn in flight.

202 rather than a 5xx also keeps this off the path `MiddlewareFactory.error()` forwards
to Sentry, which would otherwise mean one issue per long turn.

**A failed turn is still a 200**, with the reason on `status.message` (an agent that
cannot reach its MCP server reports it there). The HTTP status says only whether the
turn was accepted; the task says what became of it. Nothing in the client inspects the
result.

**The turn streams — as a preview, never as a second source of truth.** The send
goes over A2A `message/stream` on the same endpoint, relayed by
`POST /kagent/sessions/:sessionId/messages/stream`, so the reply appears as the
agent produces it: text token by token, tool calls as they happen. See "Streaming
the turn" below for the design and its failure semantics. Everything above about
`message/send` still holds — it remains the transport for answering a
confirmation, and its verify-not-report contract is exactly what the stream
degrades to when something cuts it.

### Streaming the turn

kagent serves A2A `message/stream` beside `message/send` — its own UI streams
with it — answering with an SSE stream whose `data:` frames are JSON-RPC
responses carrying the legacy-wire events: a `task` snapshot, `status-update`s
(whose `status.message` carries the agent's output), `artifact-update`s (the Go
executor streams response text this way, stamped `{adk,kagent}_partial`), and
the odd bare `message`. kagent's nginx sidecar sets `proxy_buffering off` and
a2a-go sends `X-Accel-Buffering: no`, so the frames genuinely arrive live.

**The backend relays bytes; the frontend owns the schema.** The streaming route
validates exactly what the messages route validates (one shared reader — the two
are one act over two transports), opens the upstream stream through
`KagentClient.streamMessage`, and pipes it through verbatim. It parses nothing.
Two transport details are load-bearing:

- Backstage's global `compression()` buffers `res.write()` until `res.end()`, so
  the relay flush-wraps `res.write` — the same trap and the same fix
  `ai-chat-backend`'s router documents.
- The connect phase is guarded by the ordinary request timeout, not the turn
  timeout: a2a-go writes the SSE headers before the agent does anything, so a
  slow connect means kagent is unwell. After the headers the relay is unbounded
  except for a generous duration cap and the client hanging up, both of which
  abort the upstream read — and neither of which stops the turn.

**The frontend folds events into a live overlay** (`lib/kagentStreamTurn.ts`,
rendered by the session detail page after the polled timeline): completed items
— text, reasoning, tool calls with their results folded in, the same
`TimelineItem` shapes `buildTimeline` produces — plus a live buffer for the text
still being produced. The reducer mirrors kagent's own UI, and both executors'
dialects are handled: the Python flow streams text chunks on non-final
status-updates with the terminal event carrying the complete message, the Go
flow streams `partial: true` artifact chunks with a `partial: false` complete
message and a `lastChunk` sentinel. The same reply arriving twice (complete
artifact, then repeated on the terminal status-update) is deduped by adjacent
identical text, because only one of the two carries a `messageId`.

**The poll stays the source of truth, and the overlay is disposable.** A
streamed item whose `messageId` a poll has already delivered is dropped by
recognition — the same rule as the optimistic user message — and the whole
overlay is discarded once the send's awaited invalidation has put the canonical
history on screen. This is also the backgrounded-tab story: `refetchInterval`
pauses in hidden tabs while the fetch stream keeps delivering, and whichever is
behind on refocus, reconciliation squares it.

**A lost stream is not a lost message**, and the classification mirrors the
backend's dispatch rule precisely:

- Any event at all means the turn was dispatched: a later failure — the 60 s
  gateway door, a network drop, even an in-band A2A error frame — only cut the
  preview short. The send resolves like a 202 and the poll follows the turn.
- A **transport** failure before any event (named `StreamTransportError` by the
  API client: a dead connection, a 5xx, a response that is not a stream)
  triggers one read of the session history to check whether the sent
  `messageId` landed. Present resolves as dispatched; absent — or unreadable —
  keeps the original failure, because "cannot tell" must not be read as "it
  worked".
- A **decision** (a 4xx, an in-band JSON-RPC error before anything ran) is
  reported as made, never verified away.

**Confirmations deliberately do not stream.** A confirmation request seen on the
stream is not previewed: the answer panel works off the polled task's
`status.message`, which is the one that can actually resume the task, and a
preview would invite answering a question that is not yet answerable. Answers
themselves still go over `message/send`.

**What a gateway timeout does to this.** agent-platform-standalone's backstage
and kagent controller routes set `timeouts.request: "0s"`, so there the stream
lives as long as the turn. gazelle's `agent-platform-connectivity-ui` route
carries its 60 s Envoy `BackendTrafficPolicy`, so a long turn's stream dies at
60 s — which lands in the first bullet above: preview ends, poll takes over,
nothing is reported. Streaming is strictly additive; where a door cuts it, the
page behaves exactly as it did before streaming existed.

**The sent message appears at once and vanishes by recognition.** The composer
generates the `messageId` before sending, so the optimistic copy is dropped exactly
when a poll returns a message carrying it — which happens well before the turn ends,
and would otherwise double the message for the rest of it. `TimelineItem.messageId`
exists for this; its `id` is positional and stable only for React. The stats strip
still reports the server's turn count, so "Turns" lags by one until kagent confirms —
which is honest, since no task exists yet.

**The conversation ends with a "Working…" row while the agent is mid-turn**, where its
reply will appear — otherwise a sent message sits there with nothing to say anything is
happening, which is most acute on a session's first message, where the conversation is
empty.

That indicator takes **two** signals, because neither spans a turn:

- `isAgentWorking` from `useSessionDetail` is the conversation's own verdict, but only
  once a poll has seen the new task — up to 10 s after sending;
- the in-flight send covers exactly that gap, and cannot carry the rest, since the
  gateway cuts the request off well before a long turn ends.

**`isActive` is not the same question, and three things narrow it** (`isAgentWorking`
in `lib/kagentSessionState.ts`, which the composer also closes on):

1. the newest task is in an active state;
2. that state is not one of `AWAITING_INPUT_STATES` — `input-required` is _active_ but
   the agent is blocked on a human, and a spinner there promises progress that cannot
   arrive on its own. Compared against `state.key`, the **normalised** state, never
   `state.raw`: the lookup is case-insensitive while `raw` keeps kagent's spelling, so
   comparing against `raw` would miss an `Input-Required` and then both promise progress
   and offer the composer on the one session a plain message strands;
3. the state has moved within `ACTIVE_MAX_AGE_MS`. An agent that dies mid-turn never
   writes a terminal state, so without this a stalled turn would look like a slow one
   for as long as the tab stayed open.

The state badge deliberately still reads "Working" in case 3: `state` is what kagent
says, while this is what we are willing to claim about it. Freeing the composer is the
other half of the same decision — a turn that is never going to end must not hold the
box shut forever.

**It is judged as of the last successful read, not `Date.now()`** — tied to
`dataUpdatedAt`. That is what makes it expire at all: with a render-time clock the
answer would only change when something re-rendered the page, and a stalled turn is
exactly the case where the data stops changing. It also never asserts progress at a
moment we have no data for.

`ACTIVE_MAX_AGE_MS` and the backwards walk that resolves the age basis
(`readNewestTaskState`) live in `kagentSessionState` so that this and the poll tier
cannot drift apart. They do disagree on one point, on purpose: a state with **no
usable timestamp anywhere** counts as working but polls on the baseline. An unbounded
fast poll costs every reader bandwidth for as long as the tab is open, while an
indicator that cannot expire only misleads the one person looking at it.

The composer is **withheld with a reason** rather than offered and left to fail: on a
read-only shared session (which 403s every non-GET under `/api/sessions`), when the
agent cannot be found, and while a task is `input-required`/`auth-required`. That last
one is the opposite of "busy" and the reason matters: a plain message does not answer
the agent's question — kagent opens a _new_ task and leaves the old one pending
forever — so the box would quietly strand the conversation. It is also closed while
the agent is mid-turn, since kagent has no queued follow-up: a second message competes
with the first.

Enter inserts a newline and **Cmd/Ctrl+Enter sends**, because prompts are routinely
multi-line. The field clears on submit rather than on success — the message is in the
transcript from that moment, and a turn is far too long to hold someone's text in a
disabled box. **On failure the text is handed back into the box**, since the optimistic
copy is dropped at the same time (nothing was recorded, so the transcript must not keep
showing it) and would otherwise leave a pasted manifest nowhere at all. It is handed
back by attempt id rather than as a bare string, so resubmitting identical text and
failing again restores it again, and a re-render never overwrites an edit in progress. Messages are capped at 32,000 UTF-16 code units, ours rather than
kagent's (which validates nothing), enforced in the route as well as the box. The
route's JSON body limit is raised to 256 kB so that cap is what a caller meets: 32,000
code units of CJK is ~96 kB, clearing the 100 kB default by too little to rely on, and
a body-parser 413 explains nothing.

### Answering the agent's question

An agent can stop and ask. kagent surfaces that as a task in `input-required`, and
the session cannot move on until it is answered — a plain message will not do it. So
whenever a confirmation is open the detail page shows an **answer panel**, and leaves
the reply composer on screen **disabled**, saying why.

Disabled rather than removed, deliberately: a message box that vanishes reads as the
reply feature being missing, when in fact it is blocked, and the difference matters
because the block is temporary. kagent's own UI makes the same call — it greys its box
out with `Awaiting approval…` in it.

#### A reply that does not name the task strands the agent

This is the whole difficulty, and it fails silently, so it is worth stating exactly.

ADK suspends the task on a **long-running `adk_request_confirmation` call**. The A2A
server decides what a message continues from `params.message.taskId`
(`internal/taskexec/local_manager.go`):

```go
if req.Message == nil || len(req.Message.TaskID) == 0 {
    tid = a2a.NewTaskID()      // a brand-new task
} else {
    tid = req.Message.TaskID   // resume this one
}
```

With no task id, kagent opens a new task. The agent still _reads_ the words — the
session history gives it the context of its own question — so the conversation looks
fine. But the suspended call never receives its function response: the old task stays
`input-required` for ever, and the model history holds a `tool_use` with no matching
`tool_result`.

**klaus-gateway has this bug today.** It sends the id as `params.taskId`
(`pkg/a2a/kagent_client.go`), which is not a field of `MessageSendParams` in any A2A
version and is dropped by the v0→v1 conversion. Every question answered from Slack
therefore leaves its task suspended. Verified on gazelle: a session with three
questions answered from Slack holds **seven tasks, three of them stranded**. The same
session answered from here holds **one task**, resumed in place, with its history
grown from 6 entries to 11. The fix on their side is one line — move it onto the
message.

Two constraints come with naming the task: the message's `contextId` must match the
task's, and the task must not be in a terminal state. So an ordinary reply keeps
sending **no** `taskId` — a plain message _should_ open a new task, and naming a
finished one is rejected outright.

#### The wire format

Verified twice over: read out of kagent's own source, and observed on live traffic on
gazelle. `POST <apiBaseUrl>/a2a/{ns}/{name}`, `method: "message/send"`, no
`A2A-Version` header (matching every other call here):

```json
{
  "params": {
    "message": {
      "kind": "message",
      "messageId": "<uuid>",
      "role": "user",
      "contextId": "<session id>",
      "taskId": "<the input-required task's id>",
      "parts": [
        {
          "kind": "data",
          "data": {
            "decision_type": "approve",
            "ask_user_answers": [{ "answer": ["Rideable proof-of-concept"] }]
          }
        },
        { "kind": "text", "text": "Rideable proof-of-concept" }
      ]
    }
  }
}
```

Four things about it are easy to get wrong:

- **`decision_type` is mandatory, including for a question.** Both the Go and Python
  executors read it _before_ they look at anything else and abandon the resume path
  entirely when it is missing. An answer sent without it is silently ignored.
- **`ask_user_answers` is positional** — one entry per question, in the order asked —
  and each `answer` is an **array even for a single choice**. kagent indexes into it
  and treats a short array as "that question was not answered" rather than an error,
  so a partial set resumes the agent on a premise nobody supplied. The panel refuses
  to submit until every question has something for exactly this reason.
- **An answer carries the choice's own text, not its index.** Confirmed on the wire:
  a question whose choices were `["2","3","4","5","6"]` was answered `["5"]`.
- **The text part is transcript-only.** Both executors discard the inbound message and
  substitute a synthesised function response, so nothing in it reaches the model. It
  is sent so the conversation reads correctly, and for no other reason.

Nothing echoes the confirmation's own id: kagent re-derives it from the stored task
and fans one decision out over every pending call itself.

A refusal is `decision_type: "reject"` with a **flat** `rejection_reason` string. The
per-call `rejection_reasons` map belongs to `decision_type: "batch"`, which this code
deliberately never sends — a batch key that matches no `originalFunctionCall.id`
**defaults to approve**, so one wrong key would silently permit a side-effecting tool.
Only one confirmation is open at a time, so the uniform form is sufficient.

#### What the question looks like, and what the panel does with it

`readPendingConfirmation` (`lib/kagentHitl.ts`) reads it from the suspended task's
`status.message`, never from `history`: a confirmation request stays in history for
the rest of the session even after it is answered, so only `status.message` means
"still waiting".

**It reads the task whose state _is_ the session's state** — the same one the badge
and the working indicator use, via the shared `findNewestStatefulTaskIndex`. Not "the
newest task that awaits input", which is a real and tempting mistake: because
klaus-gateway strands every question it answers, a perfectly healthy session routinely
holds several old `input-required` tasks behind a completed newest one, and searching
for those offered to answer a question the agent had moved past long ago.

ADK wraps two different things in the same request, discriminated by
`originalFunctionCall.name`:

- **`ask_user`** — one or more questions, each either a **choice list** (radio, or
  checkboxes when `multiple`) or **free text**. Both shapes occur on the same
  installation.
- **anything else** — a tool the agent wants permission to run, which takes Approve or
  Decline rather than an answer.

**Every question gets a free-text box, choices or not.** A choice list is not
exhaustive — the live examples end in "Something else (I'll explain)" — and typed words
do reach the agent, because they are sent inside the `answer` array rather than as the
message's text part. (Only the _text part_ is discarded; that distinction is easy to
get backwards, and getting it backwards is what first led this panel to offer choices
alone.) kagent's own UI puts a "Type your own answer" input beside every choice list
for the same reason.

Choices and typed words are not alternatives: `answer` is a list of strings, so a
question can be answered with a choice, with prose, or with both — "I picked this, and
here is the caveat". They are sent choices-first, the order they appear on screen. A
question counts as answered when it has either.

A single question is **not** repeated in the panel — the timeline renders it directly
above, as prose in the conversation where it belongs. With several, each is labelled,
because the pairing of choices to question is not otherwise recoverable.

When the session is waiting but the request cannot be read — an unrecognised payload,
or a task with no id — the panel is withheld and the page says so. Answering then
would be submitting a guess about what was asked.

### Starting a session

A session is started from a **composer**: a prompt, an agent, and "Start". There is
deliberately no new-session _screen_ — that is the prototype's shape, and the prompt
is the only thing the spec treats as required.

It appears in two places. **Inline above the sessions list**, collapsed to a single
line and expanding on focus, because that list is the prototype's "Mine" scope, where
creating is the job of the view rather than a secondary action — and kagent scoping
sessions to the signed-in user is exactly what makes our one list that scope. And in a
**dialog on the agent detail page**, opened by "Start a session" in the header, with
that agent preselected and the picker offering only it. Neither placement puts a
button in the shared page header for anything but opening the dialog: that slot renders
outside the plugin's `QueryClientProvider`, so the create mutation would have no client
there.

Expansion is **one-way**. Nothing collapses the inline composer again, because
collapsing on blur would hide the agent just chosen, and re-collapsing under the cursor
reads as a glitch. Enter inserts a newline and **Cmd/Ctrl+Enter starts**, matching the
reply composer.

#### Create, navigate, then send — in that order

Three steps, and the order is the whole design:

1. `POST /api/sessions` with `{agent_ref, name, source: 'user'}` — one fast call.
2. Navigate to the session's detail page, carrying the prompt in the router state.
3. The **detail page** sends the prompt as the session's first message.

The reason the send is not done by the composer is that `message/send` blocks for the
whole turn (see "Continuing a session"): awaiting it before navigating would leave the
user on the list for up to `turnTimeoutMs`, half a minute. Firing it un-awaited and
navigating anyway loses the optimistic echo instead, because `useSendMessage`'s pending
state lives in the component that just unmounted — the user would land on an empty
conversation with no sign their prompt existed until a poll caught up 10 s later.

Handing the prompt over means the machinery that already exists for a reply does all of
it: the optimistic user message, the "Working…" row, and a failure landing back in the
composer with the text intact. The agent's namespace and name travel **with** the
prompt rather than being resolved from the session, so the send can be dispatched on the
first render: resolving it the normal way needs both the session read and its join
against the fleet-wide `Agent` list, which is a beat later.

The router state is consumed exactly once and then cleared with a replacing navigation
(`useNewSessionHandoff`). This is not tidiness — router state survives a reload and a
Back navigation, so a page that read it on every render would silently start a second
paid turn with the same prompt every time the user came back.

**A session can be left empty.** If the tab is closed between the create and the send,
the session exists with no messages. It is a real session — it opens, and the composer
works on it — so nothing is broken, but it will sit in the list untitled-looking until
someone uses or deletes it.

#### Titles are ours to derive

kagent does **not** auto-title. A create with no `name` comes back with no `name` field
at all (verified against 0.9.9), so the short titles in kagent's own list are its _UI_
truncating the first message to 20 characters — which is why sessions started there look
the way they do in our list, and why that is unrecoverable. Since the spec has users
never naming sessions, `deriveSessionTitle` produces one from the prompt: whitespace
collapsed to single spaces (a prompt may be paragraphs; a title is one line), cut to 60
characters at a word boundary where that doesn't throw most of it away, with trailing
punctuation stripped before the ellipsis. Deliberately mechanical rather than a summary —
anything cleverer would mean a model call on the way to creating a session, and the
title is renameable afterwards.

#### The agent implies the installation

An agent's identity _is_ installation/namespace/name, so picking one picks the
installation too; the composer has no separate installation control. `agent_ref` is
built from the agent's **technical** name (its `Agent` resource name), never its display
annotation and never by decoding a session's `agent_id` — that encoding replaces every
`-` with `_` and cannot be reversed.

The picker lists the agents that can actually be started — **ready ones only** —
grouped by installation when there is more than one, each with the same deterministic
avatar the sessions table and the agent's own page show. Past eight agents it gains a
search box, and descriptions are truncated to one short line so a wordy one cannot push
the rest off the screen.

Non-ready agents are **omitted rather than shown disabled**. A picker is for choosing,
and an entry that cannot be chosen is noise in it; readiness and its reason belong on
the Agents tab and each agent's own page, which is where someone goes to find out why
an agent is unavailable. `isStartableAgent` is exported and shared, so the picker's
filter and the callers deciding whether to _offer_ a picker at all cannot disagree —
otherwise a page would either show an empty dropdown or withhold a usable one.

When there is exactly one agent to offer it is preselected and **the control is
disabled**: a dropdown with a single item is not a choice. It still names the agent,
which is the point inside the agent-page dialog — it confirms the target before a paid
turn is committed to it. `InstallationSelect` makes the same call for a
one-installation fleet. A lone _non-ready_ agent is never selected this way, or Start
would be offered for something that fails at the first message.

The sessions list distinguishes three reasons for having no composer at all, because
they send the reader to different places: nothing could be read (see the warning),
nothing is deployed (deploy one), or something is deployed but none of it is ready (the
Agents tab says why). Offering them would create a session whose
first turn then fails at tool-listing, with nothing on screen explaining why — and
withholding them silently would make a broken agent indistinguishable from one that
never existed. When the fleet offers no agent at all, the composer is replaced by a
sentence saying so, and that sentence distinguishes "none deployed" from "none could be
read".

**Sandbox agents need no exclusion here**, which is worth stating because it looks like
an omission. They are a separate `SandboxAgent` kind, and there is no `workloadType` on
the `Agent` v1alpha2 CRD at all — so the fleet-wide list this picker reads
(`AgentsDataProvider`, `Agent` CRs only) cannot contain one. No filter, and no extra
field on `AgentRow`.

#### The default agent is the last one used

Remembered per browser in `localStorage` (`useLastUsedAgent`, via
`use-local-storage-state` — the same mechanism as `useTableColumns`), stored as the
agent's id so it is re-resolved against the live fleet on every visit. An agent that has
since been deleted, or has stopped being ready, resolves to nothing and the composer
asks for a choice.

There is no preselection on the very first use, and that is a deliberate departure from
the prototype, which pins one canonical "general purpose agent" as the default. We have
no equivalent — just however many agents the fleet happens to run — and the two obvious
substitutes are both worse: preselecting the first agent alphabetically always offers
_something_, but the something is arbitrary, and a hasty Cmd+Enter then spends money on
an agent that can act on a cluster; preselecting nothing every time is safe but makes
the common case, the same agent as last time, cost two extra clicks.

#### What is not carried over

The prototype's composer also has a combined **visibility/team selector**, defaulting to
Private, with a lock-icon hint below the box. It has no kagent equivalent — a session is
owned by one user and there is no sharing model on 0.9.x — so it and the hint are
dropped. So is the favourites-first ordering and the star badge in its picker: we have
no favourites concept.

## The agent detail page

`/agent-platform/agents/<installation>/<namespace>/<name>`, reached by clicking an
agent in the list. All three segments are in the path because all three are part of
the agent's identity — an `Agent` name is only unique within a namespace on one
installation.

An agent can be **deleted** from the kebab menu (see "Deleting an agent"), but not
edited: editing means changing the values its HelmRelease renders from, so it needs
a re-release rather than a menu item.

The agent is fetched with a **single targeted `useResource`**, not read out of the
list's `AgentsDataProvider`, so a deep link works without the list having loaded.
It polls on the same two tiers as the list (`isAgentConverging` is now shared):
5 s while an agent is converging, 60 s once it settles or stays durably broken. The
session detail page follows the same policy with different constants, and
"Refreshing" above explains why they differ.

### Layout

Two columns from `lg` (1024px) up, one below. The **status card takes a third of
the width, beside the configuration**; everything under that row spans the full
width.

Status is the one section that does not want the whole page. A controller message
is prose — a rejected spec carries several hundred words of admission-webhook
output — and across a full-width card it runs to line lengths nobody can follow. A
narrower column is the fix. The sections below it genuinely use the width: the
skills grid fits three cards per row, and the sessions table has four columns.

### Sections

- **Header** — avatar, display name, derived readiness, technical name,
  installation/namespace, creation age, description. A kebab in the shared plugin
  header opens the **manifest dialog**: the Agent CR as read-only YAML, minus
  `metadata.managedFields` (server-side-apply bookkeeping, and the bulk of a
  reconciled Agent) and the `last-applied-configuration` annotation. That dialog is
  the escape hatch for everything the page does not surface — `deployment`,
  `sandbox`, `a2aConfig`, labels.
- **GitOps** — the shared `GitOpsCard` from `flux-react`, shown only when the
  agent's desired state really is in Git. See "GitOps provenance" below.
- **Status** — the readiness label, the controller's own explanation, an
  `UnsupportedFeatures` warning when present, a note naming both generations when
  the status is stale, and every condition verbatim through the new
  `ConditionsList` in `ui-react`. This is what makes a broken agent debuggable
  without `kubectl`, so it leads the page.
- **Configuration** — type, model, installation, namespace, created, the owning
  HelmRelease (linked to the gs deployment details page, where the release's Flux
  status already lives), and the agent's MCP-server and agent tool references.
- **System prompt** — `spec.declarative.systemMessage`, copyable. An unset value
  says so explicitly: the agent still has a prompt, just not one configured here.
- **Skills** — each `spec.skills.gitRefs` entry with its repository, path and
  `ref`, in the **same card grid the create flow's skill picker uses**, so an
  agent's skills look like the things that were picked. Read-only, via a new
  `StaticCard` sharing the picker's card shell: deliberately not a `SelectableCard`
  with the indicator hidden, since a `role="checkbox"` button that does nothing is
  announced as operable and invites a click with no effect. Unpinned refs are
  labelled "default branch (unpinned)", because that is what makes an agent's
  behaviour change without its spec changing.
- **Recent sessions** — see below.

### Deleting an agent

`useDeleteAgent` + `AgentDeleteDialog`, offered as a `Delete agent…` item in the
kebab. It deletes the agent's **`HelmRelease`**, which is what makes
helm-controller uninstall the release and take the `Agent` CR with it — an `Agent`
rendered by a chart cannot meaningfully be deleted on its own, since the release
would just render it again.

The owner is resolved through `getHelmReleaseName`/`getHelmReleaseNamespace`
(provenance labels), not by assuming the release is named after the agent, so this
also works for agents created outside the wizard.

**The delete is only offered when three things hold**, and is withheld while any of
them is still being established, so it never appears and then disappears:

1. A `SelfSubjectAccessReview` says the signed-in user may `delete` `helmreleases`
   by that name in that namespace. `useSelfSubjectAccessReview` fails closed, does
   not retry, and is never persisted, so a verdict cannot be rehydrated for a
   different user. The review decides what is _shown_; authorization itself is the
   apiserver's, since the proxy forwards the user's own OIDC token — a bypassed
   menu item still gets a real 403.
2. The owning `HelmRelease` is **in hand** — the object, not just the label naming
   it. Keying on the label would treat a release that could not be _read_ as "no
   owner": the affordance would appear and then fail, and because an unreadable
   release also reads as not-Kustomization-owned, it would quietly switch off the
   guard below. Reachable via a proxy 5xx (`ServiceUnavailableError` is not retried
   and this read does not poll) or RBAC granting `delete` without `get`.
3. The release is **not** applied by a Kustomization. Those have their desired state
   in Git and would be recreated on the next reconciliation, so they stay read-only
   (see "GitOps provenance").

**A suspended release is refused, not deleted.** Flux drops the finalizer on a
suspended `HelmRelease` without running the uninstall, so deleting it would remove
the release and leave the `Agent` and everything else the chart rendered behind —
with no owner, so this path could not clean them up afterwards either. The mutation
throws with an explanation instead of reporting an uninstall that will not happen.

The shared `OCIRepository` goes only when it is provably unused: the
`HelmRelease`es in the source's namespace are listed, and any _other_ release whose
`chartRef` resolves to the same object keeps it.

That list is read **fresh, at mutation time**, through `fetchResourceList` rather
than `useResources` — deliberately bypassing the query cache. Two reasons, both
learned the hard way in review. A cached list is up to `staleTime` (60s here) old,
so a sibling agent created moments ago in another tab would be invisible; and
`useListResources` used to key its query without the namespace, which meant a list
for a _different_ namespace could answer the question while looking perfectly
certain. The second is now fixed at the source (the namespace is part of the key),
but a destructive decision should not rest on a cache either way.

Every failure resolves to keeping the source: a failed list read means "cannot
tell", never "nothing found", and a failed delete is swallowed. The agent is gone
by then, which is what was asked for, and an unreferenced chart source is inert and
re-applied identically by the next agent creation. This is also why the permission
gate does not require `delete` on `ocirepositories`. The check does not cover
cross-namespace `chartRef`s, which would need a cluster-wide list a tenant user does
not have; the cost of being wrong that way is a chart source the next agent creation
re-applies.

**The dialog says one thing:** that this ends any session currently running with the
agent, including ones started by other people that are not shown. That is the only
thing the person clicking cannot work out for themselves — kagent scopes its session
list to the caller, so a quiet sessions list is not evidence that an agent is idle.

Everything mechanical is deliberately kept out of it: which `HelmRelease` goes, what
happens to the shared chart source, and the fact that a **suspended** release is not
uninstalled at all (Flux drops the finalizer without running the uninstall, leaving
the agent's resources behind). All true, all noise at the moment of deciding, and all
documented here instead.

Note what the dialog does _not_ claim, because an earlier draft got it wrong in both
directions: session history is **not** lost. Sessions live in kagent's own store
keyed by `user_id`, not in the `Agent` CR, and both the list and a session's detail
are fetched by session id — see `toSessionRow`'s `decodeAgentIdLabel` fallback, which
labels a session from its `agent_id` precisely when no `Agent` matches. Nor is a
re-created agent a clean slate: `toAgentIdentifier` derives `agent_id` from
`namespace/name` alone, so re-creating under the same name in the same namespace
re-associates it with those very sessions.

On success the user lands back on the agents list with a toast (`toastApiRef`, not
the deprecated `alertApi`) that says "Deleting", not "Deleted": the `HelmRelease`
has a finalizer, so all that is certain is that the apiserver accepted the request.
The agent can still be in the list for a few seconds. On failure the dialog stays
open and shows the message — there is no toast, because the user is still looking
at the modal.

### The model is read directly, not from the fleet list

The ModelConfig is fetched by name in the agent's own namespace, rather than
reusing `ModelConfigsProvider`. That provider lists ModelConfigs **across all
namespaces**, which is admin-only (see "Installation / ModelConfig querying"), so
reusing it here would deny a non-admin the model name on a page they can otherwise
read in full. When the read fails the bare reference name is shown — never an
implication that the agent has no model.

### GitOps provenance

Provenance detection is now **one implementation** in `kubernetes-react`
(`lib/k8s/provenance.ts`): `readProvenance` / `isGitOpsManaged` /
`provenanceReleaseId` (previously in `muster`) alongside `isManagedByFlux` and the
Kustomization label readers (previously in `flux-react`), plus new
`getHelmReleaseName`/`getHelmReleaseNamespace`. `flux-react` and `muster` re-export
from it, so their public APIs are unchanged.

`isManagedByFlux` (Kustomization labels only) is **false for our Agents**: they are
rendered by a Helm chart, so they carry `helm.toolkit.fluxcd.io/*` instead. The
shared `GitOpsCard` therefore gained a hop — when a resource has no Kustomization
label of its own it resolves the owning `HelmRelease` and follows _its_ labels to
the Kustomization and GitRepository. It now takes any `KubeObject` as `resource`
rather than an `App`/`HelmRelease` as `deployment`.

**Reconciled by Flux is not the same as GitOps-managed**, and the card now draws
that line: where the chain ends without a Kustomization it renders **nothing**. An
agent created through this plugin is exactly that case — the create flow applies its
`HelmRelease` and `OCIRepository` through the scaffolder, so Flux reconciles the
agent but no file in Git describes it. Claiming GitOps there is wrong in the way
that matters, because it tells the reader to go and edit something that does not
exist. The "Deployed by" row stays, and is the whole truth for such an agent.

The page still pre-gates on `isGitOpsManaged`: with no Flux or Helm marker at all
there is nothing to resolve, so the lookups are skipped entirely. The gs cluster and
deployment pages gate on `isManagedByFlux` and therefore always have a Kustomization
already, so their behaviour is unchanged.

### Recent sessions are yours, not a usage metric

The section reuses `SessionsTable` (with the agent and installation columns hidden
— the page already fixes both) over a **single-installation** query that shares the
Sessions tab's cache key, so no fleet fan-out happens and arriving from that tab
renders instantly.

kagent scopes its session list to the caller, so this can only ever show your own
conversations with the agent, and the copy says so. On an installation running
kagent in `unsecure` mode the list is everyone's, which the existing `/me` probe
already detects — the copy switches rather than claiming ownership it cannot.

### What it cannot show

The prototype's stats strip — sessions all-time, sessions in the last 30 days, a
success rate — has **no data behind it**. kagent keeps no per-agent counters and
scopes sessions to the caller, so every one of those would be a number invented
from one person's history, wrong by orders of magnitude on a shared agent. There is
deliberately no stats strip; creation age moved into the header instead. Please
don't add them speculatively.

## Configuration

All under `agentPlatform` (see `plugins/agent-platform/config.d.ts` and
`plugins/agent-platform-backend/config.d.ts`):

| Key                      | Purpose                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `chart.ociUrl`           | OCI URL of the agent chart (no tag).                                                                                              |
| `chart.version`          | Version floor / fallback. The deployed OCIRepository auto-upgrades via a semver range; this is only used for the manual snapshot. |
| `fluxServiceAccountName` | ServiceAccount the HelmRelease runs as. Required for direct apply in tenant namespaces. Provisional.                              |
| `deployTemplateRef`      | Entity ref of the deploy template. Defaults to `template:default/agent-deployment`.                                               |
| `skills.repositories`    | GitHub repo URLs to discover skills from (each `SKILL.md` is a skill).                                                            |
| `kagent.timeoutMs`       | Per-request timeout toward a kagent API (default 10000). Backend-only.                                                            |
| `kagent.installations`   | Which installations to proxy kagent for, keyed by name; also the allowlist. `apiBaseUrl` overrides the derived URL. Backend-only. |

The `kagent` keys keep the default **backend** visibility and are never served to
the frontend: `apiBaseUrl` embeds `baseDomain`, which deanonymises customers (the
same reason `gs.installations` is backend-only). The frontend learns installation
_names_ from the authenticated `GET /kagent/installations` instead.

The plugin's page and nav item are enabled via `app.extensions` in
`app-config.yaml`.

## Provisional / placeholder aspects

The manifests target the **`agent` chart** (`github.com/giantswarm/agent`,
`helm/agent`, published at `oci://gsoci.azurecr.io/charts/giantswarm/agent`). Its
values schema is settled and the generated values follow it — `agent`
(name/displayName/description/systemMessage), top-level `modelConfig.name`
(resolved in the agent's own namespace, so no namespace is passed), and top-level
`skills.gitRefs`. The deploy version and default system prompt are resolved from
the published chart at runtime (see "Chart resolution"). What is still
provisional:

- The chart enables the **muster gateway by default** (`muster.enabled: true`),
  which references a `RemoteMCPServer` named `muster` in `agent-platform` and
  expects a per-installation `muster.stsWellKnownUri`. The create flow does not
  set these, so it relies on the chart defaults — a reconcile-time dependency to
  revisit.
- `fluxServiceAccountName` is set to whatever clears admission (e.g.
  `kagent-controller` in local dev), not the canonical deploy identity (an
  `automation`-style SA in the target namespace).

---

## Open TODOs

### Installation / ModelConfig querying

The original slowness and silent-drop behaviour is fixed (query only reachable
installations, skip version discovery, surface failures — see "Model selection"
above). What remains is a separate, deeper concern:

- **Cluster-scoped list is admin-only.** We list `ModelConfig` **across all
  namespaces** (`GET …/modelconfigs`), which is **only permitted for admins**. A
  non-admin now gets a clear "couldn't read / no permission" warning instead of a
  misleading empty state, but still can't _use_ the flow. A namespace-scoped
  strategy (list only namespaces the user can read) is the real fix, and the
  Kubernetes RBAC permissions a non-admin needs must be defined **outside
  Backstage** (platform/RBAC side), then the query strategy aligned to it.
- **Reachability coupling.** Reachability filtering reads `gs`'s
  `clusterAccessStatusApiRef` directly (a cross-plugin import). If more plugins
  need it, the apiRef + types should move to a shared package.

### Deployment

- **Flux ServiceAccount.** `fluxServiceAccountName` is a placeholder that only
  clears the multi-tenancy admission policy. The **canonical deploy
  ServiceAccount and its RBAC** — provisioned per target namespace so Flux can
  actually install agent charts — is an open platform decision. Until then,
  reconciliation cannot succeed even with a real chart.
- **muster defaults.** The chart wires the muster gateway by default; the create
  flow doesn't set the per-installation `muster.stsWellKnownUri` (or opt out via
  `extraAgentSpec`/config), so this needs revisiting once agents actually run.

### Features

- **Name-conflict pre-check.** The create form does not yet check whether the
  chosen name is already taken on the target installation. kagent `Agent` names
  are unique per namespace (e.g. `sre-agent` already exists on gazelle), so a
  duplicate `Agent` — and likewise a colliding `OCIRepository` or `HelmRelease`
  of the same name — makes the deploy fail late, at apply time. We should catch
  this early: validate the slug against the existing `Agent`/`OCIRepository`/
  `HelmRelease` resources in the target namespace and block "next"/"deploy" with
  an inline error before the user reaches the review page.
- **Skills — remaining work.** Discovery and selection are implemented (see
  "Skill discovery" above), and the values now match the `agent` chart's
  top-level `skills.gitRefs`. Still open: (1) **private skill repos** need
  `spec.skills.gitAuthSecretRef` wired (the field exists in the CRD/chart but the
  create flow doesn't set it); (2) discovery reads a repo's **default branch** and
  doesn't expose per-skill version/`ref` selection in the UI.
- **Editing an agent.** Create and delete exist; edit does not. Editing means
  changing the values its HelmRelease renders from — so it needs the create flow's
  form driven from an existing agent, plus a decision about whether that produces
  a live apply or a PR (GitOps-managed agents are read-only, see "GitOps
  provenance").
- **An empty session is possible.** Starting one is a create followed by a separate
  send (see "Starting a session"), so closing the tab in between leaves a session with
  no messages. Harmless — it opens and can be continued or deleted — but a session that
  is _reliably_ either used or gone would need the send to happen server-side, which
  means a route that dispatches a turn it does not wait for.
- **The agent version is not pinned to the session.** The prototype's
  `model-session.md` requires it: a session references one agent _at a specific
  version_, pinned at launch and immutable for the session's life. kagent's session
  record has no such field — only `agent_ref` — so upgrading an agent silently changes
  what every existing session is talking to. Nothing here can fix that; it is a kagent
  data-model gap worth raising upstream rather than working around.
- **No favourites in the agent picker.** The prototype sorts favourited agents to the
  top of the composer's picker and marks them with a star. We have no per-user
  favourites concept at all, so the picker is plain installation-then-name order.
  Worth revisiting if the fleet grows past what one dropdown can present — the search
  box that appears past eight agents is the current stopgap.
- **The composer cannot offer to create an agent.** When the fleet has none, it is
  replaced by a sentence saying so, with no route onward — even though the Agents tab's
  create flow is one tab away. A link would be an easy improvement.
- **Session list row actions.** Deleting from a list row is unimplemented —
  deliberately, since a destructive action on a row someone is scanning past is easy to
  hit by accident. Renaming from a list row is merely unbuilt, and would be
  reasonable.
- **Batch decisions are not supported.** Answering sends the uniform
  `decision_type: 'approve'|'reject'` (see "Answering the agent's question"), never
  `'batch'` with a per-call `decisions` map. kagent suspends the task on one
  confirmation at a time, so the uniform form has always been sufficient here — and
  the batch form is actively dangerous to get wrong: a key that matches no
  `originalFunctionCall.id` **defaults to approve**, so one mistyped id silently
  permits a side-effecting tool. If parallel tool calls ever do arrive in one
  confirmation, the per-call ids come from `originalFunctionCall.id` (the _inner_ ones
  for sub-agent HITL), and this needs implementing deliberately rather than by
  extension.
- **Sub-agent HITL is untested.** A confirmation raised inside a delegated agent
  carries `toolConfirmation.payload.hitl_parts`, and the uniform decision we send is
  documented to fan out over those too — but no agent on the fleet has produced one, so
  it has never been exercised.
- **No stop or cancel of a running turn**, which the prototype offers as a header
  action. A2A has a cancel method; nothing is wired to it, so a turn that has gone
  wrong can only be waited out.
- **Sandbox agents cannot be messaged or started.** They need `/api/a2a-sandboxes/…`
  rather than `/api/a2a/…`, require `contextId`, and 409 on a second session. Nothing
  filters them out, and nothing needs to: they are a separate `SandboxAgent` kind, so
  the `Agent` CRs both the send path and the composer's picker read cannot contain one
  (see "The agent implies the installation"). Supporting them means reading that kind
  as well, plus the sandbox A2A path and handling the one-session 409. gazelle runs none
  today — every agent there is the default workload type — so nothing is hidden by it
  yet.
- **Sending depends on a token muster also accepts.** An agent forwards the caller's
  `Authorization` header to its MCP servers (`allowedHeaders: ["authorization"]`), so a
  token good enough for kagent but not for muster fails the turn at tool-listing rather
  than doing anything — `failed to list MCP tools … Unauthorized`, observed while
  probing with a hand-made token. Every agent on gazelle depends on muster, so this is
  a real dependency of the send path and not a corner case, even though the Dex token
  the proxy forwards is expected to satisfy both.
- **The rename fallback is waiting on a kagent bump.** Rename works on v0.9.x only
  through the session upsert, because `HandleUpdateSession` there cannot rename at all
  (see "Renaming a session"). Everything propping that up is marked
  `TODO(kagent-0.9)` and should be deleted once no installation runs v0.9.x, leaving
  the plain `PUT /api/sessions/:id`.
- **Streaming covers only the turn this tab sent.** A turn started elsewhere — a
  Slack thread, kagent's own UI, another browser tab — still arrives through the
  10 s poll, because following it live needs a cheap way to notice and subscribe
  to a running task (`tasks/resubscribe` exists, but knowing _when_ to call it is
  the poll again). Upstream work on incremental session reads
  (giantswarm/giantswarm#37361) is the real unlock; revisit then.
- **`A2A-Version` is still unsent**, on the send as well as the reads, so both speak
  the legacy v0 wire kagent defaults to. They have to agree, or the states will not
  line up. `TODO(kagent-0.11)`: legacy is marked for removal there, at which point both
  need pinning together.
- **No manual refresh on the session detail page.** The page polls now (see
  "Refreshing"), so staleness is capped at 60 s and there is nothing frozen to
  rescue — but there is still no way to say "check again, now", which is the one
  thing polling cannot answer for a session past the age bound. The reason it was
  left out is cost, not doubt: the control belongs in the page header, which renders
  outside this plugin's `QueryClientProvider`, so it needs `refresh` and
  `isRefreshing` on `SessionDetailView`, threaded through the `actions` memo whose
  whole job is to keep the header slot from re-registering on every poll.
  `plugins/muster`'s `FreshnessIndicator` is the shape to copy, ported to bui and
  promoted to `ui-react`.
- **Landing page.** The section still opens on the Agents tab. Whether the
  platform wants a proper landing page above the tabs — fleet health, recent
  activity — is an open product question, not a gap in the tabs themselves.

### UX

- **Post-deploy experience.** Deploy currently navigates to the standard
  scaffolder task page for apply logs. An in-context status/success view (staying
  within the agent-platform flow) is a possible improvement.
