---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

The new-session composer offers a workspace beside the agent: the workspaces
of the agent's installation, with their repository count and last sync, or
"No workspace". It is preset to the workspace last used with that agent. A
start in a workspace checks first that you can read every repository in it:
an unconnected provider shows its sign-in and the start goes on once you are
signed in; a refusal names the repositories you cannot read and keeps your
prompt. `AgentPlatform.sessionStarted` reports whether a workspace was picked.
