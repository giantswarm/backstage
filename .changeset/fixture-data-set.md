---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
---

Fixture mode's data, outside production builds only. `@giantswarm/backstage-plugin-gs-common/fixtures` builds a seeded data set of installations, organizations, agents, connectors, sessions, workflows and executions, with a count, a least name length and the states for each list; the base data set has every state, and only made-up names. muster and agent-platform map its records onto the types their clients read. Fixture mode serves three made-up installations, `FIXTURE_INSTALLATIONS` in gs-common, instead of one. kubernetes-react exports `AGENT_BLOCKED_REASON`.
