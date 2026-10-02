---
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-platform-capabilities': patch
'@giantswarm/backstage-plugin-repositories': patch
'@giantswarm/backstage-plugin-roadmap': patch
---

Report meaningful portal actions through Backstage's analytics API: a new
`analytics-react` library with the typed event list and `useTrackedMutation`.
Creating an agent (`AgentPlatform.agentCreated`), starting a session
(`AgentPlatform.sessionStarted`) and registering an MCP server
(`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
