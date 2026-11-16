---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Fixture mode serves gs-backend's skill routes from the fixture data set: the skill repository reads and the skill pull request go through a new `SkillDiscoveryApi`, which `agentPlatform.fixtures` swaps for a fixture, so Customize · Skills, a skill's page and Add skill neither read from nor write to GitHub. A proposed skill opens a made-up pull request kept in memory.
