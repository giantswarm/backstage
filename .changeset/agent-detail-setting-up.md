---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent detail page: a new agent that reads as failed while it is still being provisioned — a release Flux has not installed yet, or `ResolvedRefs=False` because the RemoteMCPServer it is bound to does not exist yet — shows as **Setting up** for three minutes instead of "did not become ready", and as the failure only after that. `Accepted=False`, `Compatible=False` and a suspended or deleting release are shown at once. The page keeps re-reading a failed agent and agent-manager's failed verdict, backing off from 5 s (3 s for the verdict) to 60 s, so it turns ready without a reload.
