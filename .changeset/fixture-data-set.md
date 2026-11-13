---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Fixture mode's data, outside production builds only. `@giantswarm/backstage-plugin-gs-common/fixtures` builds a seeded data set of installations, organizations, agents, connectors, sessions, workflows and executions, with a count, a least name length and the states for each list; the base data set has every state, and only made-up names. muster and agent-platform map its records onto the types their clients read.
