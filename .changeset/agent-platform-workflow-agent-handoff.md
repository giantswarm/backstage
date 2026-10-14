---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Hand workflows to the workflow agent (`agentPlatform.metaAgents.workflowManagement`): "Edit via agent" on a workflow's page starts a session about that workflow, and the Workflows overview offers to create one with the agent. Both stay hidden unless the role resolves to an agent that can take a session. Sessions started there report `AgentPlatform.sessionStarted` with the new entry points `workflowEdit` and `workflowCreateAssist`.
