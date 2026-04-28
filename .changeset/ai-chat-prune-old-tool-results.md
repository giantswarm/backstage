---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Replace older tool outputs in the AI chat with `[Old tool result content cleared]` once cumulative tool I/O past the most recent two user turns exceeds a budget. Mirrors OpenCode's continuous prune. Tunable via `aiChat.pruning.reservedTokens` (default 20000) and `aiChat.pruning.minimumSavingsTokens` (default 10000); `getSkill` results stay verbatim.
