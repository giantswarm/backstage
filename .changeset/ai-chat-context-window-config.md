---
'@giantswarm/backstage-plugin-ai-chat': patch
---

Allow overriding the context window size used by the context usage bar via `aiChat.contextWindow` in app-config. When set, this value is used regardless of the model name; otherwise the built-in model-prefix lookup applies.
