---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs': minor
---

Fixture mode for the muster and agent-platform plugins, outside production builds only. `muster.fixtures` serves one signed-in installation from memory, its tool calls answered by the fixture MCP servers that plugins attach to `api:muster/muster` (`fixtureMcpServersDataRef`); a tool no fixture handles fails with an error. `agentPlatform.fixtures` serves kagent, model-manager and agent-manager's credential operations from memory. With `gs.fixtures` the app serves a Kubernetes API without a cluster for the installations, and their cluster access reads as healthy; `gs.authProvider` is optional in the config schema, as the code already treated it. `yarn fixtures start` runs the portal in fixture mode on free ports of its own.
