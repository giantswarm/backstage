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
the fleet. The list itself carries no actions: a session opens into its detail page,
where it can be **deleted** (see "Deleting a session"), but nothing here creates or
renames one.

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
  provenance"). "Launch session" also has no write path today.
- **Continuing a session.** The detail view, rename and delete exist (see "Renaming a
  session" and "Deleting a session"); kagent's chat endpoint still has no UI, so a
  session can be read and named but not carried on. Deleting from a list row is also
  unimplemented — deliberately, since a destructive action on a row someone is
  scanning past is easy to hit by accident. Renaming from a list row is merely
  unbuilt, and would be reasonable.
- **The rename fallback is waiting on a kagent bump.** Rename works on v0.9.x only
  through the session upsert, because `HandleUpdateSession` there cannot rename at all
  (see "Renaming a session"). Everything propping that up is marked
  `TODO(kagent-0.9)` and should be deleted once no installation runs v0.9.x, leaving
  the plain `PUT /api/sessions/:id`.
- **An unanswered question is not shown.** When a task is `input-required`, the
  question the agent is waiting on lives in `status.message` — the wire schema
  already parses it and says so — but `buildTimeline` only ever reads
  `status.timestamp`, so nothing renders it. The page shows a "Waiting for input"
  badge above a conversation that just stops, with no indication of what was asked.
  Observed live on gazelle. The fix is a timeline entry (or a panel above it) for the
  pending prompt; note it is not part of task `history`, so it needs handling of its
  own rather than falling out of the existing walk. Answering it is a separate gap —
  see "Continuing a session" for the missing write path.
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
