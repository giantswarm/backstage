---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

The session page has a small "Show tool activity" switch on the line with its
start time, on by default. Off, the conversation shows only the person's
messages, the agent's replies, its questions and the request the session is
waiting on; work summaries, reasoning and other permission requests are
hidden. The choice is kept per person across sessions and reloads, and
reported as `AgentPlatform.toolActivityChanged`.
