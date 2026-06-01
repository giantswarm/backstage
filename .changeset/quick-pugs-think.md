---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

AI chat: make the Anthropic thinking config model-aware. Adaptive-thinking Claude models (Opus 4.5+, Sonnet 4.6) now use `thinking: { type: 'adaptive' }` plus `effort` (configurable via `aiChat.anthropic.effort`, default `high`) instead of the legacy `thinking: { type: 'enabled', budgetTokens }` shape, which those models reject with a 400 ("thinking.type.enabled is not supported for this model"). Older Claude models keep the legacy budget-based interface, and non-Claude models are unaffected. For adaptive-thinking models, `temperature`/`topP`/`topK` from `aiChat.sampling` are dropped (with a warning) since those models also reject them.
