---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The create wizard composes the per-namespace `agent` `OCIRepository` with the
bounded chart range `>=0.2.1 <1.0.0` instead of the open `x.x.x`. Chart 1.x of
the Generic agent chart carries a breaking values schema (kagent API v2) that
agents created by this wizard cannot render; since `kube:apply` overwrites the
range on every agent creation, the bound has to come from the wizard itself.
