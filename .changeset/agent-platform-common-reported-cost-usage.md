---
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

`UsageTally`, `SessionUsageTotals` and `UsageAgentEntry` carry an optional `costUsd`, summed from the `costUsd` in each turn's `kagent.dev/a2a/usage` metadata and absent when no turn reported one. `reduceSessionUsage` fills it and `normalizeSessionUsage` reads it. New `addTally` adds one `UsageTally` into another.
