---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agent Platform shell's home page builds around the choice of agent. Under
the greeting a line says what to do, or which agent the session starts with.
The picker lists every agent, grouped by namespace behind the person's recent
agents, with unavailable ones disabled and their reason shown, and is always
searchable. Beside it the chosen agent's model is named; under the composer
the three most recent agents are one press away until one is chosen, and then
a line says which connectors it can use. A "Manage agents" link leads to
Customize when `AgentPlatformHome` is given `manageAgentsHref`. Sessions
started there keep up to 199 characters of the first prompt as their title.
