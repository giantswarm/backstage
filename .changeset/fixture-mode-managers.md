---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Fixture mode serves workspace-manager, toolchain-manager and skill-manager, outside production builds only: their tools answer from the base data set, so the Workspaces, Toolchains and Skills tabs, their detail and edit pages, and the New session dialog's workspace and toolchain pickers show data without a cluster. The data set of `@giantswarm/backstage-plugin-gs-common/fixtures` gains builders for provider owners and repositories, workspaces, toolchain sources and toolchains, and skill repositories. Writes are kept in memory until the page reloads; a sync runs for a few seconds, and a new toolchain's pull request moves through its checks.
