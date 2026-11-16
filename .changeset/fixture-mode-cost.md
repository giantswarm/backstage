---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Fixture mode serves the agent gateway's metrics, outside production builds only: with `gs.fixtures`, a fixture `MimirApi` evaluates the usage pages' PromQL over gateway series derived from the base data set (the agents with sessions, their default model, the person and two teammates), so Usage · Overview, Cost and Your sessions show spend, tokens, calls and gateway health without an observability stack. The person's model cost on Your sessions comes from the same series. The fixture installations' service account answers a made-up token, and `@giantswarm/backstage-plugin-gs/fixtures` exports `MimirFixtureApi` for tests.
