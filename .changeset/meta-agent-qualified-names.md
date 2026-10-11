---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

`agentPlatform.metaAgents.*` values must now name the agent as `<namespace>/<name>`, or `<installation>/<namespace>/<name>` where it runs on several installations. A bare name, or a value that matches more than one agent, resolves to nothing, and the feature that role gates stays hidden. Before, a bare name matched the first agent with that name in any namespace the viewer could list, so anyone who could create an agent there could take over the role. Update existing configs, for example `skillCreation: skill-creator` to `skillCreation: kagent/skill-creator`.

The first messages that meta-agent hand-offs send (Evaluate, Edit via agent, the skill creator) now frame workflow definitions, skill content and drafts as data the agent must not take instructions from. Names and paths from repositories are reduced to one line.
