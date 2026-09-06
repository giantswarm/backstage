---
'@giantswarm/backstage-plugin-muster': minor
---

Rework the muster dashboard's metrics and the standard-server rows on the MCP servers page.

**Dashboard.** The "Fleet health" matrix is gone — it repeated the MCP servers page row for row. In its place, three views that neither the servers page nor the MCP usage page already show:

- **Capability surface** — what agents can reach through this muster: the tools, resources and prompts each server group contributes to the aggregated catalogue, plus muster's own core tools. A family's tools are counted once (muster deduplicates them across its instances); resources and prompts are per instance and add up. Needs an authenticated session, like the Tools stat.
- **Fleet coverage** — how far each standard family reaches across the management clusters the installation federates: `10/24 clusters`, a bar split into healthy / degraded / not deployed, and the names of the clusters the family is missing from. This is what tells a family still being rolled out (capi on 10 of 24 clusters) apart from one that is failing.
- **Provenance & authentication** — how many servers and workflows are GitOps-managed vs registered live, how many servers are deactivated, how many workflows carry validation warnings, and how the servers' users authenticate (platform SSO, token exchange, own account, AWS SigV4, anonymous).

The Browse grid now links all five views; MCP usage and Tool explorer were missing.

**MCP servers page, standard servers.** A family federated across two dozen clusters used to wrap its cluster pills onto three lines, while a family on fewer clusters simply had a shorter row — the two were indistinguishable at a glance. The collapsed row now keeps to one line: degraded clusters first (most severe first), healthy ones until the row is full, the rest folded into "+N more", and the trailing figure reads `24 clusters` or, for a partially deployed family, `10/24 clusters`. Expanding a family lists every cluster (degraded first) in a new "Management clusters" block, names the clusters it is not deployed on, and moves the per-cluster diagnostics up next to it.
