---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

**Connect a model** offers **Claude on Vertex AI** and **Gemini on Vertex AI**
(`AnthropicVertexAI`, `GeminiVertexAI`). For these, the form asks for the
Google Cloud **Project ID**, the **Location** (`global`, `us`, `eu` or a
region) and a **Service account key**, either pasted or read from the
downloaded JSON key file. It writes them to the model's `anthropicVertexAI` or
`geminiVertexAI` block, and stores the key in the model's Secret under
`GOOGLE_APPLICATION_CREDENTIALS`. Before saving, the form checks the key the
way kagent does: it must be a service account key of the same project, and
its token endpoint must be `https://oauth2.googleapis.com`. A key that fails a
check is reported on the field. An edit can keep the stored key, unless the
project changes.

Existing Vertex AI models can now be edited in the portal. The model page's
Overview says that the LLM gateway does not meter Vertex AI models, so their
spend and tokens are not on the Usage tab. `ModelConfig` gains
`getAnthropicVertexAI()` and `getGeminiVertexAI()`.
