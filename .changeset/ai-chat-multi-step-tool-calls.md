---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix AI chat silently producing empty replies whenever the model uses a tool.

Since the upgrade to `ai` v6 (PR #1160), `streamText` defaults to
`stopWhen: stepCountIs(1)`, which terminates the assistant turn right after
the first tool call -- before the model is given a chance to consume the
tool result and produce a user-facing answer. The chat UI sees the stream
finish with `finishReason: "tool-calls"` and no text, so the spinner just
disappears.

Set `stopWhen: stepCountIs(20)` so the agent loop runs to completion, and
expose the cap as a new optional `aiChat.maxSteps` config (default `20`).
