---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

Make AI chat sampling parameters configurable per installation. The plugin previously called `streamText()` without `temperature`, `topP`, `topK`, `seed`, `minP`, or `maxOutputTokens`, so the server's defaults applied -- which for vLLM means `temperature=1.0, top_p=1.0, top_k=-1, seed=null`. That is far too loose for a tool-using agent backed by a reasoning model and was the dominant cause of token-cost variance in production agent loops (same prompt, fresh chat, observed total-token spread of 22k / 607k / 22k across three runs against the same Qwen3 endpoint).

Config now accepts an `aiChat.sampling` block:

```yaml
aiChat:
  model: <model>
  sampling:
    temperature: 0.6
    topP: 0.95
    topK: 20
    minP: 0
    # seed: 42
    # maxOutputTokens: 4096
```

All fields are optional; default behaviour with no `sampling:` block is unchanged. `temperature`, `topP`, `topK`, `seed`, and `maxOutputTokens` are forwarded through the AI SDK to every provider that supports them. `minP` is spliced into the request body via the OpenAI-compatible provider's `transformRequestBody` hook, since vLLM accepts it as a top-level field but it is not part of the AI SDK call settings. The README documents recommended values per model family (Qwen3 thinking/non-thinking, Qwen3-Coder, GPT-4 / GPT-4o, Anthropic Claude).
