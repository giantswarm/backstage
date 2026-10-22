---
'@giantswarm/backstage-plugin-agent-platform': minor
---

An agent can carry a default workspace: the agent form's More options gain an
optional Default workspace select, listing the environment's workspaces, and
the agent's page shows it. A new session's workspace select presets to the
workspace the person last chose with that agent, else to the agent's default,
else to "No workspace"; a start in the default passes the same access check,
sign-in and refusal as any picked workspace. Every start without a workspace
now says so to agent-manager (`noWorkspace`), so it never lands in the
agent's default by omission.
