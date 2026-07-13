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
  both previewed on the review page and applied verbatim.
- A standalone `values.yaml` + `helm install` command for the manual fallback.

We deliberately deviate from the prototype's 3-file/ConfigMap model: the
prototype's `HelmRelease` referenced a `ConfigMap` that was never generated, so
we inline the values instead (the common self-contained Flux pattern).

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

## Configuration

All under `agentPlatform` (see `plugins/agent-platform/config.d.ts`):

| Key                      | Purpose                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `chart.ociUrl`           | OCI URL of the agent chart (no tag). Provisional.                                                    |
| `chart.version`          | Chart version the manifests pin to. Provisional.                                                     |
| `fluxServiceAccountName` | ServiceAccount the HelmRelease runs as. Required for direct apply in tenant namespaces. Provisional. |
| `deployTemplateRef`      | Entity ref of the deploy template. Defaults to `template:default/agent-deployment`.                  |
| `skills.repositories`    | GitHub repo URLs to discover skills from (each `SKILL.md` is a skill).                               |

The plugin's page and nav item are enabled via `app.extensions` in
`app-config.yaml`.

## Provisional / placeholder aspects

The manifests target the **`agent` chart** (`github.com/giantswarm/agent`,
`helm/agent`). Its values schema is settled and the generated values follow it —
`agent` (name/displayName/description/systemMessage), top-level `modelConfig.name`
(resolved in the agent's own namespace, so no namespace is passed), and top-level
`skills.gitRefs`. What is still provisional:

- **Not released to the OCI registry yet** (chart version is `0.0.0-dev`, no
  tags). So the OCI URL is real but the pinned **version** is a placeholder, and
  a deploy will pass admission and create both resources but the `HelmRelease`
  will **not reconcile** until the chart is published.
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
- **`agent` chart release.** The chart (`giantswarm/agent`) exists and its values
  schema is settled, but it is not published to the OCI registry yet
  (`0.0.0-dev`, no tags). The deploy cannot reconcile until it is released and a
  real version is pinned via `agentPlatform.chart.version`.
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
- **Agent list / management view.** Only the create flow exists so far.
- **Main menu entry + landing page.** The plugin is not yet surfaced in the main
  sidebar menu. Adding it requires deciding **what page the entry leads to** —
  there is no landing page yet (only the create flow and a minimal index). The
  natural target is the agent list/management view above; until that exists the
  entry could point straight at the create flow. Decision needed.

### UX

- **Post-deploy experience.** Deploy currently navigates to the standard
  scaffolder task page for apply logs. An in-context status/success view (staying
  within the agent-platform flow) is a possible improvement.
