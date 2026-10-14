---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Add the pieces of the agent-platform shell's Customize screen: `CustomizeDataProvider` and `useCustomizeData` (the agents, models and skills in scope, with a count per tab), `CustomizeAgentsPanel`, `CustomizeSkillsPanel`, `CustomizeModelsPanel`, `EnvironmentSelect`, `OrganizationSelect` and `ALL_ORGANIZATIONS`.

The Skills tab and its count list each skill once, matching an agent's skill to the catalog whatever form either repository URL is written in (`.git`, `git@host:`, case on github.com). Above the skills a line says how many skills from how many sources there are. A repository that could not be read is named once, with the reason, and no "No skills yet" is claimed then.
