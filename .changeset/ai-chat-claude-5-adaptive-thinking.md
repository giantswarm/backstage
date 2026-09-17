---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
'@giantswarm/backstage-plugin-ai-chat': patch
---

Support the Claude 5 model family in the AI chat.

`claude-sonnet-5`, `claude-opus-5` and `claude-fable-5`/`-5-1` use adaptive thinking plus `output_config.effort`; the legacy `thinking: { type: 'enabled', budgetTokens }` shape they were previously sent is rejected with a 400, as are `temperature`, `topP` and `topK`. Adding them to `ADAPTIVE_THINKING_MODEL_PREFIXES` fixes both, because the same predicate also gates the sampling-parameter strip.

The frontend context-usage display learns their context windows (1M each) and prices, along with the `claude-opus-4-7` and `claude-opus-4-8` prices that were missing — those models showed no cost estimate at all.
