---
'@giantswarm/backstage-plugin-muster': patch
---

The MCP server detail page says when a server is deactivated.

A server with `spec.suspended: true` used to read like an outage: the row said
`Disconnected`, the Configuration block listed everything but the suspension,
the Tools block said the server "may be down or unreachable", and `Sign in` was
on offer — signing in produced a muster session that read "connected / 58
tools" while the Tools block stayed empty, because muster's reconciler undoes
the connection right away. The `Activate` button in the action row was the
only trace of the deactivation.

- The list row and the detail header lead with a neutral **Deactivated** badge,
  ahead of the live state; a family's per-cluster pill reads `Deactivated`
  instead of `Disconnected` for a deactivated instance.
- The Configuration block carries a **Deactivated** row that says muster keeps
  the server disconnected and points at `Activate` (for an ad-hoc server; a
  GitOps-managed one has no Activate on this page, so the row stops at the
  fact).
- The Tools empty state reads "No tools exposed — this server is deactivated.
  Use “Activate” in the actions below.", taking precedence over the
  reachability and sign-in wording.
- `Sign in` is disabled while the server is deactivated, with the reason as a
  tooltip — the same shape as the gated Reconnect. The gate is the portal's own
  reading of the CR, not muster's refusal. `Sign out` stays available, since a
  stale grant is exactly what such a server may still need revoked.
- The runtime block marks the session rows (`Session`, `Tools (session)`, …) as
  the session's last connection rather than a working server while the server
  is deactivated.
