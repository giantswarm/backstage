# Agent Platform

The `agent-platform` plugin (`@giantswarm/backstage-plugin-agent-platform`)
provides the UI for creating and (later) managing kagent agents from Backstage.
It is a re-implementation of the APUI (Agent Platform User Interface) prototype
as native, real-data Backstage pages.

This page documents the **agent-creation flow** (`/agents/new` →
`/agents/new/review`) as it stands, and the open work still ahead.

## Overview of the create flow

Two custom in-context pages, built with **bui** (`@backstage/ui`), driving the
scaffolder engine underneath ("Hybrid C"):

1. **`/agents/new`** — the form (`NewAgentPage`). Identity (name, auto-derived
   slug, description) and configuration (installation, model, system prompt,
   skills).
2. **`/agents/new/review`** — review and deploy (`NewAgentReviewPage`). Shows the
   composed manifests, deploys them directly, and offers a manual-install
   fallback.

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
`SkillPicker` renders them as multi-select cards.

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

- **Deletion must not remove the shared OCIRepository.** A future "delete agent"
  flow should only delete that agent's `HelmRelease`; `OCIRepository/agent` is
  still referenced by any other agents in the namespace. Remove it only when the
  last agent in the namespace is gone (or leave it).
- **Per-agent chart versions aren't expressible.** The sharing relies on every
  agent tracking the same range. If a specific agent ever needed a different
  chart version, it would need its own OCIRepository (e.g. named after the slug).
  Not a concern under the current always-latest approach.

### The `agent-deployment` template

`catalog/templates/agent-deployment/template.yaml` is a thin wrapper around
`kube:apply` (tagged `hidden` so it stays out of the `/create` list). It applies
the manifest verbatim, so what the review page shows is exactly what is applied.

> **Note:** `/catalog` is gitignored — this template is a **local-dev artifact**
> only, like `app-deployment`. Real deployments load templates from the external
> `giantswarm/backstage-catalogs` repo, so **the template must also be added
> there** for the deploy button to work outside local development. Register it
> for local dev via `catalog.locations` in `app-config.local.yaml` (see
> `app-config.local.yaml.example`).

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
the fleet. Read-only: no create, delete, rename, or detail view.

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

**Read-only.** kagent can rename, delete and continue a session, and the prototype
offers all three. None are wired up, so this screen ships without a write path.

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
  which references a `RemoteMCPServer` named `muster` in `agentic-platform` and
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
- **Production template registration.** The `agent-deployment` template must be
  added to `giantswarm/backstage-catalogs` for the deploy button to work outside
  local development.

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
- **Agent management actions.** The agent list exists; management does not. A
  delete action must respect the shared `OCIRepository/agent` (see "Shared
  OCIRepository per namespace") — delete only the agent's `HelmRelease`, not the
  shared source.
- **Session management + detail.** The Sessions tab is read-only. kagent supports
  deleting (soft) and renaming sessions, and exposes a session's events and A2A
  tasks — enough for a detail view. Deliberately deferred: rename in particular
  deviates from the prototype, where sessions are never user-named.
- **Main menu entry + landing page.** The plugin is not yet surfaced in the main
  sidebar menu. Adding it requires deciding **what page the entry leads to** —
  there is no landing page yet (only the create flow and a minimal index). The
  natural target is the agent list/management view above; until that exists the
  entry could point straight at the create flow. Decision needed.

### UX

- **Post-deploy experience.** Deploy currently navigates to the standard
  scaffolder task page for apply logs. An in-context status/success view (staying
  within the agent-platform flow) is a possible improvement.
