---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Show readiness for each agent in the Agent Platform agents list
(`/agent-platform/agents`), which previously gave no health signal at all.

- New "Status" column with four states derived from the `Agent`'s status
  conditions: **Ready**, **Not ready** (accepted, but the backing workload has no
  available replica), **Not accepted** (the controller rejected the spec), and
  **Pending**. Hovering a non-ready agent shows the controller's own explanation
  — the reconcile error, or "Deployment is not ready, N/M pods are ready" — so
  the common cases don't need a `kubectl` round-trip. Any
  `UnsupportedFeatures` warning is appended to the same tooltip.
- The table is now sortable on every column, like the sessions list. Status sorts
  by severity rather than alphabetically, so one click brings the agents needing
  attention to the top. The default order is unchanged (installation, then name).
- **Pending** covers an agent the controller has not reconciled yet, or whose
  `status.observedGeneration` still lags `metadata.generation` — so a just-edited
  agent reads as "not known yet" instead of showing stale conditions as fact.
  kagent's own UI has no equivalent state.
- The list now polls, on a two-tier interval evaluated per installation: 60s
  normally (matching the query client's `staleTime`, so it doesn't undercut the
  cache), dropping to 5s for an installation that has an agent still converging.
  An agent that has been non-ready for over 3 minutes is treated as durably
  broken rather than converging, so it falls back to the baseline instead of
  pinning its installation to the fast interval for as long as the tab stays
  open. Interval refetches only run while the tab is focused.
- The "loading more agents" bar now means "an installation has not reported its
  first result yet" rather than "a request is in flight". With polling, the old
  meaning made the bar flash during steady state, and since it sits above the
  table it pushed the table down on every poll. Its slot is also a fixed height
  now, so toggling it can never shift the table.
- `ui-react`: new shared `StatusLabel` — an icon plus a label describing the
  state of something, built on bui (`Flex`/`Text` plus a `--bui-fg-*` intent
  token) rather than on `@backstage/core-components`' `Status*`. Each intent has a
  distinct silhouette as well as a distinct colour, so a status survives
  greyscale and colour blindness, and the label is a sibling of the icon so
  assistive tech reads it (`Status*` puts `aria-hidden` on a span wrapping both
  its icon _and_ its children, which silently hides any label passed as a child).
  The agents list is the first consumer; `gs`, `muster` and `flux-react` each
  still have their own implementation and can migrate as their pages move to bui.
- `kubernetes-react`: add readiness to `Agent` — `getReadiness()`,
  `getReadinessMessage()`, `getUnsupportedFeaturesWarning()`, `getConditions()`,
  `getCondition()` — plus the free functions `deriveAgentReadiness()`,
  `isAgentTransitional()` and `getAgentStatusChangedAt()` for callers that hold
  raw list data rather than hydrated instances, and the `AgentConditionType`
  constants. The `ready` derivation matches kagent's REST API exactly: it keys on
  the `Ready` condition's _reason_ (`DeploymentReady`/`WorkloadReady`), so a
  missing Deployment (`Ready=Unknown`/`DeploymentNotFound`) counts as not ready.
