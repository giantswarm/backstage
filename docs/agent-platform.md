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
   slug, description) and configuration (installation, model, system prompt).
   Skills are deferred (a "coming soon" note).
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

The plugin's page and nav item are enabled via `app.extensions` in
`app-config.yaml`.

## Provisional / placeholder aspects

The `general-purpose-agent` chart **does not exist yet**. Consequently:

- The chart URL, version, and the shape of the inlined values are assumptions.
- A deploy will pass admission and create both resources, but the `HelmRelease`
  will **not reconcile** (Flux cannot pull the chart). This is expected until the
  chart is published.
- `fluxServiceAccountName` is set to whatever clears admission (e.g.
  `kagent-controller` in local dev), not the canonical deploy identity.

---

## Open TODOs

### Installation / ModelConfig querying

The worst of the original slowness/silent-drop behaviour is addressed (query only
reachable installations, skip version discovery, surface failures instead of
dropping them — see "Model selection" above). What remains:

- **Cluster-scoped list is admin-only.** We still list `ModelConfig` **across all
  namespaces** (`GET …/modelconfigs`), which is **only permitted for admins**. A
  non-admin now gets a clear "couldn't read / no permission" warning instead of a
  misleading empty state, but still can't _use_ the flow. A namespace-scoped
  strategy (list only namespaces the user can read) is the real fix.
- **RBAC for non-admins.** The Kubernetes RBAC permissions a non-admin user needs
  in order to discover `ModelConfig`/`Agent` resources must be defined **outside
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
- **`general-purpose-agent` chart.** Does not exist. The chart URL/version/values
  shape are provisional and the deploy cannot produce a working agent until it is
  published.
- **Production template registration.** The `agent-deployment` template must be
  added to `giantswarm/backstage-catalogs` for the deploy button to work outside
  local development.

### Features

- **Skills.** Discovery and selection of agent skills is not implemented. There is
  no OCI skill-catalog backend to browse yet; the create form shows a "coming
  soon" note and new agents start with no skills. Skills do exist in the kagent
  API (`spec.skills.refs`), so this is a UI/backend gap, not an API gap.
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
