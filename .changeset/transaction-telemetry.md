---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Report more of what people do in the Agent Platform as usage data, with no
names or other identifiers in any signal:

- A tool run from its page that returned a result is reported as
  `Muster.toolRan`, next to `Muster.workflowRan` for a workflow's.
- Deleting an agent is reported as `AgentPlatform.agentDeleted` (`mode`:
  `apply` or `commit`).
- Creating, editing and deleting a model is reported as
  `AgentPlatform.modelCreated`, `AgentPlatform.modelUpdated` and
  `AgentPlatform.modelDeleted`.
- On a connector's page, an edit is reported as `Muster.mcpServerUpdated`,
  Activate, Deactivate and Reconnect as `Muster.mcpServerConnectionChanged`
  (`change`: `activated`, `deactivated`, `reconnected`), and Delete as
  `Muster.mcpServerDeleted`.

`DefinitionEditorDialog` takes the event its save reports (`saveEvent`) in
place of `saveUntrackedReason`.
