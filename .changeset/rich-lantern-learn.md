---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Export `RecentSessions`, the signed-in user's most recently started sessions with the ones waiting on them marked, and `AgentPlatformProviders`, the plugin's query client and fleet-wide data providers for rendering its components outside its pages.

Export `StartNewSession`, the session composer as the Sessions tab shows it, and `AgentPlatformHome`, a greeting above it for use as a home page.

Add state filter chips, each with its count, and an agent filter to the Sessions list, and export `AGENT_SHELL_FLAG`, under which the Agent Platform page drops its tab strip and a session's page its session switcher.

Export `ServingLayerGate`, which renders its children only where the Models tab offers its Serving view.
