---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

**Connect a model** offers **Claude on Vertex AI** and **Gemini on Vertex AI**
(`AnthropicVertexAI`, `GeminiVertexAI`). For these, the form asks for the
**Location** (`global`, `us`, `eu` or a region) and the **Service account
key** file, chosen or dropped on the field. The key is never shown: the field
says which service account and project the file names, and the model runs in
that project. The form writes the model's `anthropicVertexAI` or
`geminiVertexAI` block, and stores the key in the model's Secret under
`GOOGLE_APPLICATION_CREDENTIALS`. As soon as a file is chosen, the form checks
it the way kagent does: it must be a service account key naming a project,
and its token endpoint must be `https://oauth2.googleapis.com`. An edit keeps
the stored key until another file is chosen.

The form's "Provider & model" section is now two: **Provider** (with the
endpoint or location) and **Model**. Location is checked when the person
leaves the field, like the form's other fields.

Existing Vertex AI models can now be edited in the portal. The model page's
Overview says that the LLM gateway does not meter Vertex AI models, so their
spend and tokens are not on the Usage tab. `ModelConfig` gains
`getAnthropicVertexAI()` and `getGeminiVertexAI()`.
