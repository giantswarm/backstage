---
'@giantswarm/backstage-plugin-gs': minor
---

Explain an installation whose inventory probe was refused, and stop re-probing it.

The installation inventory (`GET /apis` per installation) decides which
installations the Agent Platform tabs query. When the API server rejected the
person's token (401 -- the ID token carried no audience it accepts) or refused
the read (403), the installation silently dropped out of every tab, and the
probe was re-run on every mount of the hook: one rejected token showed up as ten
`401 GET /api/kubernetes/proxy/apis` per page load.

- The probe fails with an `InventoryProbeError` carrying the status and the
  reason; `isInventoryAuthError` tells a 401/403 apart from a failure worth
  retrying. A refused probe is not re-run on mount (`retryOnMount: false`); an
  explicit `refresh()` and an installation turning healthy again still re-run it.
- `selectInventoryFailure` / `classifyInventoryFailure` / `inventoryFailureCopy`
  name the failure a section has to explain (the pinned installation's, or the
  home's) and word it: a rejected token offers the sign-out (a silent refresh
  cannot repair it), a refused or failed read offers a retry.
- `InventoryFailureGate` renders that as the muster-style gate;
  `InstallationInventoryGate` reads the section scope and the inventory itself,
  for a tab to drop in next to its scope note.
