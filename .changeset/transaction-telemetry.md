---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Report more of what people do in the Agent Platform as usage data, with no
names or other identifiers in any of these events:

- A tool run from its page that returned a result is reported as
  `Muster.toolRan`, next to `Muster.workflowRan` for a workflow's. A
  connector tool run there reports the connector's event below instead.
- Deleting an agent is reported as `AgentPlatform.agentDeleted` (`mode`:
  `apply` or `commit`).
- Creating, editing and deleting a model is reported as
  `AgentPlatform.modelCreated`, `AgentPlatform.modelUpdated` and
  `AgentPlatform.modelDeleted`.
- Editing a connector, in the wizard opened from its Edit or as JSON on its
  page, is reported as `Muster.mcpServerUpdated`; Activate, Deactivate and
  Reconnect as `Muster.mcpServerConnectionChanged` (`change`: `activated`,
  `deactivated`, `reconnected`), and Delete as `Muster.mcpServerDeleted`.

- In a session, sending a message (a first message included), answering the
  agent's question, stopping a turn, renaming and deleting the session are
  reported as `AgentPlatform.messageSent`, `AgentPlatform.questionAnswered`,
  `AgentPlatform.turnStopped`, `AgentPlatform.sessionRenamed` and
  `AgentPlatform.sessionDeleted`, with nothing of the text, the answer or how
  it was given.

`DefinitionEditorDialog` takes `saveTracking`, the event its save reports or
the reason it reports none, in place of `saveUntrackedReason`.
