---
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

`UsageTally`, `SessionUsageTotals` and `UsageAgentEntry` carry an optional `costUsd`: the cost agents' runtimes reported in each turn's `kagent.dev/a2a/usage` metadata, summed over the turns that reported one. `reduceSessionUsage` fills it on the session tally and each day, and `normalizeSessionUsage` reads it from a `session-usage` body. It stays absent when no turn reported a cost, so "not reported" never reads as zero.
