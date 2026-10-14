---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Add the create-agent assist: a side chat with the configured agent-management
meta agent (the "Swarm Operator") on the create flow's first step.

- A "Let <agent> help" affordance on `/agent-platform/agents/new`, gated on the
  `agentPlatform.metaAgents.agentManagement` role mapping (decision G13):
  hidden entirely while the role is unconfigured or names no existing agent.
- The affordance opens a side panel (full-screen at phone width) hosting an
  ordinary kagent session with that agent — `NewSessionComposer` with the
  assistant preselected and a create-agent-context prompt prefilled and
  editable, then the conversation in place: polled timeline, streamed live
  turn, composer, the agent's `ask_user` questions answered in the panel, and
  a link to the full session page.
- Accept-into-form: each fenced code block of the agent's newest reply gets a
  "Use as system prompt" button that copies it into the form's System prompt
  field, with a one-step Undo. This is deliberately the whole accept mechanism:
  kagent replies are plain markdown with no structured suggestion protocol, so
  the prototype's richer accept-to-apply (skills into the selection, per-field
  patches) stays out until the backend carries structure for it.
- `analytics-react`: `AgentPlatform.sessionStarted` gains the
  `createAgentAssist` entry point.
