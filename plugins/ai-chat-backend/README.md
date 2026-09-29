# ai-chat

> **Deprecated.** The AI assistant is deprecated. No new features are being
> added to it; changes are limited to fixes and keeping it building.

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

## Providers

The provider is selected from `aiChat.model`:

- `claude-*` → Anthropic (`aiChat.anthropic`), or Google Vertex AI when
  `aiChat.anthropic.provider` is `vertex` (`aiChat.google`)
- `gemini-*` → Google Vertex AI (`aiChat.google`)
- otherwise → Azure OpenAI (`aiChat.azure`, when configured), an
  OpenAI-compatible server (`aiChat.openai.api: chat`, e.g. vLLM), or OpenAI

### Google Vertex AI (Gemini)

A `gemini-*` model routes chat through Google Vertex AI using the first-class
[`@ai-sdk/google-vertex`](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex)
provider. Vertex is **not** authenticated with a static API key: the provider
uses `google-auth-library` to read a service-account JSON and mint +
auto-refresh short-lived (~1 h) OAuth2 access tokens for us — no custom
token-refresh code is involved.

```yaml
aiChat:
  model: gemini-2.5-flash
  google:
    project: my-gcp-project # GCP project ID
    location: europe-west1 # Vertex region
    keyFilename: /app/google/credentials.json # mounted service-account JSON
```

- `keyFilename` is the path to the mounted SA JSON and is required — the
  backend treats Vertex as configured only when that file actually exists.
- Streaming and tool-calling work exactly as with the other providers.
- `temperature`, `topP`, `topK`, `seed`, and `maxOutputTokens` pass through as
  usual (see [Sampling](#sampling)); `minP` is not supported by Vertex.
- `GET /api/ai-chat/health` reports `provider: google-vertex` and
  `configured: true` once project, location and credentials are all set.

In the Helm chart, set `google.project`, `google.location`, and
`google.credentialsJson` (the SA JSON content, SOPS-encrypted in gitops); the
chart mounts it at `/app/google/credentials.json` and exports
`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`. The same values serve Claude
on Vertex, below.

### Claude on Google Vertex AI

`aiChat.anthropic.provider: vertex` serves `claude-*` models from the Anthropic
publisher on Vertex AI instead of Anthropic's own API — for installations that
run Claude on their own GCP project. There is no Anthropic API key: the
credentials are the `aiChat.google` service account, exactly as for Gemini.

```yaml
aiChat:
  model: claude-sonnet-5
  anthropic:
    provider: vertex # default: api, i.e. Anthropic's own API
  google:
    project: my-gcp-project
    location: global # or a multi-region (eu, us) or a single region
    keyFilename: /app/google/credentials.json
```

- The key defaults to `api`, so installations with `aiChat.anthropic.apiKey`
  are unaffected. The provider is never switched implicitly by the presence or
  absence of credentials — a missing key stays a misconfiguration, not a silent
  reroute.
- `aiChat.anthropic.effort`, adaptive thinking and prompt caching apply exactly
  as on the direct Anthropic path; streaming and tool calling too.
- `aiChat.anthropic.baseUrl` is ignored here — the URL is derived from the
  project and location.
- `GET /api/ai-chat/health` reports `provider: google-vertex-anthropic` and
  takes `configured` from the Google configuration.

Two prerequisites on the GCP side, both outside this plugin:

- the Claude model must be enabled for the project in Vertex AI Model Garden,
  for the location in use — otherwise Vertex answers `404 NOT_FOUND … was not
found or your project does not have access to it`;
- the service account needs `roles/aiplatform.user` on the project.

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
