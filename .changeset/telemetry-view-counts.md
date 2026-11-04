---
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'app': minor
---

Usage data says how big what people work with is, as exact numbers and never
by name. Opening an agent's page sends `AgentPlatform.agentViewed` with its
number of skills and of tools; opening a session sends
`AgentPlatform.sessionViewed` with its number of turns; opening Customize sends
`AgentPlatform.customizeViewed` with its number of agents, skills, connectors,
models, workflows, workspaces and toolchains. Each goes once per opening of the
page, once its counts have finished loading; a count that could not be read is
left out. `AgentPlatform.messageSent` now carries the session's number of
turns.

`analytics-react` adds count attributes (`COUNT` in `portalEvents`, a whole
number of 0 or more, which the connector checks) and `useTrackedView`, which
reports a page's view event once per opening.
