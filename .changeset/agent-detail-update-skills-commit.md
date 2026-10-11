---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent detail: **Update skills** is offered for an agent applied from git too, when agent-manager can open pull requests. The dialog asks the same dry run in commit mode (each git skill's pinned commit next to the default-branch head), confirms as **Open pull request**, shows the pull request it opened and then only closes; the agent's skills move once it is merged. A live agent keeps the direct update. Reported as the existing `AgentPlatform.agentUpdated` with `mode: commit`, `change: skillsRefreshed`.
