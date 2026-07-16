---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Add Google Vertex AI (Gemini) as an AI chat provider.

A `gemini-*` model in `aiChat.model` now routes chat through Google Vertex AI via the first-class `@ai-sdk/google-vertex` provider. Vertex is not authenticated with a static API key: the provider uses `google-auth-library` to read a mounted service-account JSON and mint + auto-refresh short-lived OAuth2 access tokens, so no custom token-refresh code is needed. Streaming and tool-calling work exactly like the existing providers.

Configure via a new `aiChat.google` block (`project`, `location`, `keyFilename`); `gemini-` takes precedence ahead of the Azure/OpenAI selection, and `GET /api/ai-chat/health` reports `provider: google-vertex`.
