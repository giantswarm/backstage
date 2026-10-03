---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

`AgentReadiness`: the value `notAccepted` is now `failed`. On kagent API v2 an admitted template always reads `Accepted=True`, so a failure lies in a later stage. New `Agent.getFailure()` returns the root-cause condition (the first `False` stage that is not `Blocked`) and the part of the agent it is about (`model`, `tools`, `systemPrompt` or `platform`), read with the new `failureFieldOf()` from kagent's message prefixes. `AGENT_CONDITION_STAGE_ORDER` exports the order in which the controller evaluates the conditions.
