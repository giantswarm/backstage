---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent detail page shows an agent whose HelmRelease exists but whose
AgentTemplate is not rendered yet as **deploying** instead of "Agent not found".

Right after Deploy, agent-manager's `create_agent` has applied the HelmRelease
and the create flow navigates to the detail page before helm-controller renders
the template, so the template read answers 404. The page now tells "not yet"
from "not there" through agent-manager's `get_agent_status` — the same read the
creation progress polls — which answers `not_found` only when neither the
template nor the HelmRelease exists. While the release is there the page shows
the name and avatar, a "Deploying" label and agent-manager's summary of where
the release stands, re-reads the template every 5 s and switches to the rendered
agent in place. "Agent not found" remains for an agent that exists nowhere, and
for installations without agent-manager.
