---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix AI chat being unavailable for every provider at runtime.

PR #1926 bumped the `@ai-sdk/*` providers a full major (anthropic/azure/openai to `^4`, openai-compatible to `^3`) while the `ai` core stayed on `^6`. The major-4 providers emit language-model specification `v4`, but the entire `ai@6` line only accepts `v2`/`v3` — so every chat request threw `AI_UnsupportedModelVersionError` before reaching the model. The unit tests didn't catch it because they mock the services and never resolve a model through `streamText`.

Revert the providers to the major line compatible with `ai@6` (anthropic `^3.0.76`, azure `^3.0.64`, openai `^3.0.63`, openai-compatible `^2.0.47`), which emit spec `v3`.
