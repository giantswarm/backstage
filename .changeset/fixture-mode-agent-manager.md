---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Fixture mode serves agent-manager, outside production builds only: every tool of it answers from the base data set, so the agent list, an agent's page, the New agent flow and editing an agent work without a cluster, and so do the organizations with their members, models, connectors and egress policies and the credential form. Writes are kept in memory until the page reloads; an agent created or changed reports its new generation at once and the controller's verdict a few seconds later. `@giantswarm/backstage-plugin-agent-platform/fixtures` exports the Agent, RemoteMCPServer, ModelConfig and Harness objects the fixture Kubernetes API lists. An organization's Models, Connectors and Egress tables no longer fail on a resource named like one of their columns, such as a model named `default`.
