---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Add the `skillCreation` meta-agent role (`agentPlatform.metaAgents.skillCreation`) for the skill creator agent, which writes complex, nested skills in conversation.

- Add Skill and Edit Skill show a strip above the form where the role resolves to an agent that can take a session: "Use this form for simple skills", the skill creator agent for more complex, nested skills, and **Let <agent> help**. The strip is the one the create-agent flow's "Let Swarm Operator help" uses, now a shared `MetaAgentBanner`. Pressing it starts a session with the agent and opens it. The first message names the target repository and what was typed so far, or the skill being edited (repository, SKILL.md path, commit, branch). It asks the agent to ask about the skill's purpose before writing and to propose the skill as a pull request. Where the role is unconfigured or names no startable agent, nothing shows. The forms themselves stay SKILL.md-only.
- `agent-platform-common`: `skillCreation` joins `META_AGENT_ROLES`.
- `analytics-react`: `AgentPlatform.sessionStarted` gains the `skillCreationAssist` entry point.
