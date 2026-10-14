---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

The session page has a "Show tool activity" switch in its header, on by
default. Off, the conversation shows only the person's messages, the agent's
replies, its questions and any request still waiting on the person; work
summaries, reasoning and decided permission requests are hidden. The choice is
kept per person across sessions and reloads, and reported as
`AgentPlatform.toolActivityChanged`.
