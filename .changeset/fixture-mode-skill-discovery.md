---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Fixture mode serves the portal's own skill source from the fixture data set: gs-backend's skill repository reads go through a new `SkillDiscoveryApi`, which `agentPlatform.fixtures` swaps for a fixture, so Customize · Skills, a skill's page and Add skill no longer read GitHub.
