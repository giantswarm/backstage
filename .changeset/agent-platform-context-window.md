---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

The session cost popover's **Context used** is the newest model call's prompt, no longer the sum of every call in the newest turn, which on a long turn ran to several times the model's window and was then shown capped at 100%. A count above the configured window now shows as a raw count with a line saying the configured window looks too small, never as a share. A claude Harness turn, which reports only a total over its calls, reads "Not reported". The default `agentPlatform.models.contextWindows` table names each Claude family on its own, following Anthropic's documentation: 1M for the 5.x models, Opus 4.6 to 4.8 and Sonnet 4.6, 200k for Opus, Sonnet and Haiku 4.5, and no `claude-*` catch-all. `agent-platform-common` adds `readContextReading`.
