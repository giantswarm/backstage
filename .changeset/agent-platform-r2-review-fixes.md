---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-analytics-react': patch
---

On the agent wizard's Tools step, undoing a change to a preset-based toolset collapses it back to the preset, keeping what was added beside it, even after a round trip through another step, and a preset whose coverage cannot be read no longer shows its connectors as None. Leaving a session mid-turn ends its stream once the message has reached the agent, and a stalled turn reads "Not responding" instead of "Working". Pins, favorites and dismissed hints toggled in quick succession all persist, and pinning and favoriting are reported as `AgentPlatform.sessionPinChanged` and `AgentPlatform.agentFavoriteChanged`. A hand-off to a meta agent caps the draft it carries and refuses a prompt over the 32,000-character message limit before creating a session; that limit is now one constant in agent-platform-common.
