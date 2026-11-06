---
'app': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

Gate the Organizations pages behind the `agent-platform-organizations` feature flag, off by default. `agentPlatform.organizations.enabled` enables or disables the pages for everyone and overrides saved browser flags. Show their navigation entry only when the pages are enabled and an agent-manager reports support for Agent Platform organizations. Direct links to enabled pages show discovery failures as errors instead of reporting the feature unavailable.
