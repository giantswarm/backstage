---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-muster': minor
---

Export `AGENT_SHELL_FLAG` from the common package, so plugins that render inside the agent-platform shell read the flag without depending on the agent-platform plugin. The agent-platform plugin keeps re-exporting it. muster reads it through its own `useAgentShell` hook.
