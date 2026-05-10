# ai-chat

This plugin backend was templated using the Backstage CLI. You should replace this text with a description of your plugin backend.

## Installation

This plugin is installed via the `@giantswarm/backstage-plugin-ai-chat-backend` package. To install it to your backend package, run the following command:

```bash
# From your root directory
yarn --cwd packages/backend add @giantswarm/backstage-plugin-ai-chat-backend
```

Then add the plugin to your backend in `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...
backend.add(import('@giantswarm/backstage-plugin-ai-chat-backend'));
```

## Sampling

The Vercel AI SDK omits `temperature`, `topP`, `topK`, `seed`, `minP`, and
`maxOutputTokens` from the request whenever they are not set, so the
**server's defaults** apply. For vLLM that means `temperature=1.0,
top_p=1.0, top_k=-1, seed=null` -- far too loose for a tool-using agent,
and the dominant cause of token-cost variance in production agent loops
(same prompt, fresh chat, observed total-token spread of 22k - 607k - 22k
across three runs against the same Qwen3 endpoint).

Configure sampling per installation:

```yaml
aiChat:
  model: <model name>
  # ... provider config (openai / anthropic / azure) ...
  sampling:
    temperature: 0.6
    topP: 0.95
    topK: 20
    minP: 0
    # seed: 42        # optional, for evaluation/regression-test deployments only
    # maxOutputTokens: 4096
```

All fields are optional; when unset the SDK / provider defaults apply.
`temperature`, `topP`, `topK`, `seed`, and `maxOutputTokens` are forwarded
through the AI SDK to every provider that supports them. `minP` is not
part of the SDK call settings; the plugin splices it into the outgoing
request body for the OpenAI-compatible (vLLM) provider, where it is most
useful.

### Recommended values per model family

| Model family                | temperature | topP | topK | minP | notes                                                                                                                                                     |
| --------------------------- | ----------- | ---- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qwen3 thinking-mode         | 0.6         | 0.95 | 20   | 0    | Qwen team's official recipe; do **not** use greedy decoding -- the Qwen team explicitly warns it leads to performance degradation and endless repetitions |
| Qwen3 non-thinking          | 0.7         | 0.8  | 20   | 0    | Qwen team's official recipe                                                                                                                               |
| Qwen3-Coder                 | 0.7         | --   | --   | --   |                                                                                                                                                           |
| GPT-4 / GPT-4o (tool use)   | 0.0 - 0.3   | --   | --   | --   | greedy is fine here                                                                                                                                       |
| Anthropic Claude (tool use) | 0.0 - 0.3   | --   | --   | --   | greedy is fine here                                                                                                                                       |

### Examples

vLLM-served Qwen3 thinking-mode (recommended):

```yaml
aiChat:
  model: Qwen/Qwen3-30B-A3B
  openai:
    baseUrl: http://<vllm-svc>/v1
    apiKey: not-needed
    api: chat
  sampling:
    temperature: 0.6
    topP: 0.95
    topK: 20
    minP: 0
```

Real-OpenAI / Anthropic Claude tool-use deployment:

```yaml
aiChat:
  model: gpt-4o
  openai:
    apiKey: ${OPENAI_API_KEY}
  sampling:
    temperature: 0
```

For evaluation / regression-test deployments where bit-identical responses
across runs are desired, combine `temperature: 0` with a fixed `seed`. Do
**not** ship a fixed seed to production -- users would see the same
deterministic answer to ambiguous questions.

## Development

This plugin backend can be started in a standalone mode from directly in this
package with `yarn start`. It is a limited setup that is most convenient when
developing the plugin backend itself.

If you want to run the entire project, including the frontend, run `yarn start` from the root directory.
