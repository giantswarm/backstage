---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

Every link into the Agent Platform shell resolves through a route ref, an
external route ref the app binds, or a helper built on one, instead of a
hand-written `/agent-platform/…` or `/customize/…` path. No address changes.

agent-platform adds a `newSession` external route (the shell's home, bound by
the app like `customize`) and a `musterServer` external route (a connector's
page), and exports the route refs it kept private:
`agentEdit`, `modelEdit`, `serveModel`, `importModel`, `pullModel`,
`addModelBackend` and `addGpuNodePool`, and the Usage views `usageOverview`,
`usageCost`, `usageConversations` and `usageConnectors`. muster exports
`newMcpServerVerify` and `withInstallationQuery`, which builds the query of a
connector, tool or workflow link: `?installation=` first, then any further
parameters.
