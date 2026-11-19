---
'@giantswarm/backstage-plugin-agent-platform': patch
---

In the agent wizard's individual tools, ticking a whole connector replaces its single tools, which it covers and which otherwise counted against the 32-selector limit. Its tools show ticked, and unticking one keeps the connector's other tools. A copied toolset drops such single tools too, and the limit message no longer suggests All for a connector that already has it.
