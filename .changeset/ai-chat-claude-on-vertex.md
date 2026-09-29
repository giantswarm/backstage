---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Serve Claude models from Google Vertex AI.

`aiChat.anthropic.provider: vertex` routes `claude-*` models through the Anthropic publisher on Google Vertex AI instead of Anthropic's own API, so an installation can run Claude on its own GCP project with no Anthropic API key. Authentication reuses the existing `aiChat.google` block: `@ai-sdk/google-vertex` reads the mounted service-account JSON and google-auth-library mints and auto-refreshes the short-lived OAuth2 tokens. Streaming, tool calling, adaptive thinking, `aiChat.anthropic.effort` and prompt caching behave as they do on the direct Anthropic path.

The key defaults to `api`, so installations configured with `aiChat.anthropic.apiKey` are unaffected — the provider is never switched implicitly by the presence or absence of credentials. `GET /api/ai-chat/health` reports `provider: google-vertex-anthropic` and takes `configured` from the Google configuration.
