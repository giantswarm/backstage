# User facing feature flags

- `agent-platform-shell`: Opts one browser into the Agent Platform shell on its own routes (`/`, `/sessions`, `/usage`, `/profile`, `/customize`) next to the classic portal, with cross-links between the two, while the deployment has the Agent Platform switched off. Takes effect after a reload. Deployments switch the shell on for everyone with `app.portals.agentPlatform` (see `packages/app/config.d.ts`); while that is on, the flag is moot and not listed in the settings.
- `ai-chat-verbose-debugging`: Enables verbose output for the AI Chat plugin, showing reasoning output and tool usage details.
