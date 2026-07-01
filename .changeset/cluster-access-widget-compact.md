---
'@giantswarm/backstage-plugin-gs': patch
---

Make the "Cluster access" sidebar widget cleaner and cover non-broker installations.

- Compacted the popover: the header now shows a problem-first count summary
  ("1 degraded · 4 healthy", or "All N healthy" when nothing needs attention)
  instead of a single worst-state word, and each installation is a single-line
  row. Healthy/connecting rows drop the redundant status label, while degraded
  and session-expired rows show the reason left-aligned next to the name so the
  list is easy to scan.
- Surfaced non-broker installations (per-cluster OIDC popup logins), which were
  previously invisible because only broker-covered installations are probed.
  They can't be probed proactively without triggering a login popup, so the
  connector now mirrors their auth session state: an installation appears while
  the user is signed in and drops off on sign-out. Adds a `remove` method to the
  cluster-access status store to support this.
