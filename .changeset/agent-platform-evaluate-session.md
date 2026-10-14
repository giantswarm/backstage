---
'@giantswarm/backstage-plugin-agent-platform': minor
---

**Evaluate** on a skill's page is now a direct action rather than a dialog. It starts a session with the agent configured as `metaAgents.skillEvaluation` and opens it, like every other session entry point. The session's first message names the skill, its repository, its SKILL.md path, its commit and its branch. It asks for an evaluation report in the chat and a pull request with the proposed improvements. The button still appears only where the role resolves. If the session cannot start, the page says why and stays put. The evaluate dialog is removed.
