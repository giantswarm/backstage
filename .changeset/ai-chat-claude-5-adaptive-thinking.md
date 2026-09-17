---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
'@giantswarm/backstage-plugin-ai-chat': patch
---

Support the Claude 5 model family in the AI chat.

`claude-sonnet-5`, `claude-opus-5` and `claude-fable-5`/`-5-1` use adaptive thinking plus `output_config.effort`; the legacy `thinking: { type: 'enabled', budgetTokens }` shape they were previously sent is rejected with a 400, as are `temperature`, `topP` and `topK`. Adding them to `ADAPTIVE_THINKING_MODEL_PREFIXES` fixes both, because the same predicate also gates the sampling-parameter strip.

Adaptive-thinking models now also ask for `thinking.display: summarized`. That default is not stable across model generations — Opus 4.6 and Sonnet 4.6 default to `summarized`, Opus 4.7+ and the Claude 5 family to `omitted` — so the reasoning pane rendered empty blocks on the newer models. Thinking is billed the same either way.

The frontend context-usage display learns their context windows (1M each) and prices, along with the `claude-opus-4-7`, `claude-opus-4-8` and `claude-haiku-4-5` entries that were missing — those models showed no context bar and no cost estimate at all.
