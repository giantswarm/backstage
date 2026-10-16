---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

The session cost popover's **Context used** is the newest turn's largest model call (prompt plus output), no longer the sum of every call in the turn, which on a long turn ran to several times the model's window and was then shown capped at 100%. A raw count never sits beside a share: above the configured window, or for a model the table does not name, it shows with a line saying why. A claude Harness turn, which reports only a total over its calls, reads "Not reported". The default `agentPlatform.models.contextWindows` table names each Claude family on its own, following Anthropic's documentation: 1M for the 5.x models, Opus 4.6 to 4.8 and Sonnet 4.6, 200k for Opus, Sonnet and Haiku 4.5, and no `claude-*` catch-all. `agent-platform-common` adds `readUsageReport` (a usage bag's totals and context reading, parsed once) and `claimEndedTurnMessage`.
