---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Fixture mode serves the agent gateway's metrics, outside production builds only: with `gs.fixtures`, a fixture `MimirApi` evaluates the pages' PromQL over gateway series derived from the base data set (the agents with sessions, their default model, the person and two teammates), so Usage · Overview, Cost and Your sessions show spend, tokens, calls and gateway health without an observability stack. A query it cannot evaluate answers no series, with a console warning. The person's model cost on Your sessions runs the backend's queries through it, and the backend and fixture mode decide from the answers with the same code, now in `@giantswarm/backstage-plugin-agent-platform-common` (`modelCostQueries`, `modelCostOf`, `callerEmail`). `MimirClient` refuses to query without a token itself, instead of the Mimir hooks, and `@giantswarm/backstage-plugin-gs/fixtures` exports `MimirFixtureApi` for tests.
