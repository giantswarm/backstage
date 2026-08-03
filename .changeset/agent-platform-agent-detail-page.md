---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs': patch
---

Add the agent detail page. Clicking an agent in the list now opens
`/agent-platform/agents/<installation>/<namespace>/<name>` — all three segments,
because an `Agent` name is only unique within a namespace on one installation.

**Read-only.** Editing an agent means changing the values its HelmRelease renders
from, and deleting one must remove only that release and never the `OCIRepository` a
namespace's agents share — so neither is a menu item yet, and neither is "Launch
session".

The page has seven sections:

- **Header** — avatar, display name, derived readiness, technical name,
  installation/namespace, creation age, description. A kebab in the shared plugin
  header opens a **manifest dialog** with the Agent CR as read-only YAML, minus
  `metadata.managedFields` (server-side-apply bookkeeping, and the bulk of a
  reconciled Agent) and the `last-applied-configuration` annotation. That dialog is
  the escape hatch for what the page does not surface — `deployment`, `sandbox`,
  `a2aConfig`, labels.
- **GitOps** — the shared `GitOpsCard`, but only when the agent's desired state
  really is in Git.
- **Status** — readiness, the controller's explanation, an `UnsupportedFeatures`
  warning when present, a note naming both generations when the status is stale, and
  every condition verbatim. This is what makes a broken agent debuggable without
  `kubectl`, so it leads the page rather than following the configuration.
- **Configuration** — type, model, installation, namespace, created, the owning
  HelmRelease (linked to its deployment page, where the release's Flux status already
  lives), and the MCP-server and agent tool references. A Muster gateway reference
  links to muster's Tool Explorer with the installation preselected.
- **System prompt** — copyable. An unset value says so explicitly: the agent still
  has a prompt, just not one configured here.
- **Skills** — the same card grid the create flow's picker uses, so an agent's
  skills look like the things that were picked, plus the `ref` each is pinned to
  (the picker has no equivalent: it always reads a repo's default branch). Via a new
  read-only `StaticCard` sharing the picker's card shell — deliberately not a
  `SelectableCard` with the indicator hidden, since a `role="checkbox"` button that
  does nothing is announced as operable and invites a click with no effect.
- **Recent sessions** — the newest few, over a single-installation query sharing the
  Sessions tab's cache key.

Decisions worth knowing:

- **No stats strip.** The prototype's sessions all-time / sessions 30d / success rate
  have no data behind them: kagent keeps no per-agent counters and scopes its session
  list to the caller, so each would be a number invented from one person's history —
  wrong by orders of magnitude on a shared agent. Creation age moved into the header
  instead. The sessions section says whose sessions they are, and switches wording on
  an installation whose kagent is not user-scoped rather than claiming ownership it
  cannot.
- **The agent is fetched directly**, not read out of the list's provider, so a deep
  link works without the list having loaded. It polls on the same two tiers as the
  list (`isAgentConverging` is now shared): 5 s while converging, 60 s once settled or
  durably broken.
- **The model is read by name in the agent's own namespace**, not through the
  cluster-wide `ModelConfigsProvider` list, which is admin-only — reusing it would
  deny a non-admin the model name on a page they can otherwise read in full. A failed
  read falls back to the bare reference, never to "no model".
- **A missing agent is a not-found state, not an error**, and the copy covers the
  case where kagent simply isn't installed on that installation.
- **Rows link with a real anchor** on the agent name as well as a whole-row click, so
  cmd- and middle-click open a new tab and keyboard users have something focusable.
  Not `rowConfig.getHref`: `BUIProvider` is not mounted in this app, so react-aria's
  `RouterProvider` is inactive and a bui `href` would trigger a full page reload. The
  `stopRowPress` guard that keeps both affordances from firing on one click is now
  shared between the agents and sessions tables.

**GitOps provenance is de-duplicated.** `readProvenance` / `isGitOpsManaged` /
`provenanceReleaseId` (previously in `muster`) and `isManagedByFlux` with the
Kustomization label readers (previously in `flux-react`) now live in one module in
`kubernetes-react`, alongside new `getHelmReleaseName`/`getHelmReleaseNamespace`.
`flux-react` and `muster` re-export from it, so their public APIs are unchanged.

The distinction mattered here: `isManagedByFlux` is **false** for a kagent `Agent`,
which is rendered by a Helm chart and so carries `helm.toolkit.fluxcd.io/*` rather
than Kustomization labels. `GitOpsCard` therefore gained a hop — with no
Kustomization label of its own it resolves the owning `HelmRelease` and follows
_its_ labels to the Kustomization and GitRepository — and now takes any `KubeObject`
as `resource` instead of an `App`/`HelmRelease` as `deployment`.

It also stops equating "reconciled by Flux" with "GitOps-managed": where that chain
ends without a Kustomization it now renders **nothing**. An agent created through
this plugin is exactly that case, since the create flow applies its `HelmRelease` and
`OCIRepository` through the scaffolder — Flux reconciles the agent, but no file in
Git describes it, and saying otherwise sends the reader looking for something that
does not exist. The "Deployed by" row remains, and is the whole truth for such an
agent. The gs cluster and deployment pages gate on `isManagedByFlux` and so always
have a Kustomization already; their behaviour is unchanged.

**New in `ui-react`: `SimpleAccordion`** — one collapsible section, carrying the
bottom padding bui's accordion trigger lacks, so an expanded header does not sit
flush against its panel. Four places had composed bui's accordion primitives
directly and fixed that locally in three different ways — one of them with a
selector scoped to the trigger element rather than the button that actually carries
`aria-expanded`, so it matched nothing. gs's `SimpleAccordion` re-exports this one
and gains the fix; `useSimpleAccordionStyles` exposes the rule for cases needing
controlled or exclusive expansion. `plans`' `MergedTab`, agent-platform's
`TimelineEntry` and muster's `DisclosureAccordion` still carry their own and could
adopt it.

**New in `ui-react`: `ConditionsList`** — a bui renderer for a resource's status
conditions. One collapsible entry per condition with its type, satisfaction, relative
transition time, reason and message; newest transition first, and the first failing
condition expanded, because that is the one the reader came for. Takes an `isFailing`
override for abnormal-true conditions (`Stalled`, `UnsupportedFeatures`), where
`status: True` is the bad news.
