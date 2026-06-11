# @giantswarm/backstage-plugin-ai-chat-backend

## 0.17.3

### Patch Changes

- f84adcc: Fix AI chat hanging forever when an MCP server is slow or its responses are dropped by the transport.
  - MCP servers are now connected in parallel and each connection/tool-load is bounded by a timeout (15s default, configurable per server via `aiChat.mcp[].timeoutMs`). A hanging server is reported as failed and the chat continues with the remaining servers' tools.
  - Patch `@ai-sdk/mcp` to treat SSE events without an explicit `event:` field as `message` events, per the SSE specification. MCP servers behind agentgateway emit bare `data:` frames, which the unpatched client silently dropped — leaving the request promise pending forever and hanging the whole chat request.

- Updated dependencies [f84adcc]
  - @giantswarm/backstage-plugin-gs-node@0.3.1

## 0.17.2

### Patch Changes

- c117a5e: Support muster MCP servers behind per-user auth (`authProvider` entries in
  `aiChat.mcp`): the muster frontend now forwards the user's OAuth token to the
  muster-backend proxy, which opens per-user MCP sessions. Previously such
  servers were reported as unconfigured and the Workflows page failed with a 503.

  Also addresses review feedback on the initial muster plugins: the shared MCP
  client cache moved from ai-chat-backend to `@giantswarm/backstage-plugin-gs-node`
  and is reused by muster-backend; config parsing no longer throws on unnamed
  `aiChat.mcp` entries; muster-backend uses `@backstage/errors` classes instead
  of a hand-rolled error middleware; query parameter validation rejects empty
  and repeated values; execution fetch errors are surfaced in the UI instead of
  being silently swallowed; duplicate workflow step ids no longer drop nodes
  from the graph; and `formatDuration` is shared instead of copy-pasted.

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-gs-node@0.3.0

## 0.17.1

### Patch Changes

- ab25e30: Log the "no OpenAI API key configured" message at `info` instead of `warn`. This is the expected state when a customer hasn't set up the AI chat feature, so it should no longer be forwarded to Sentry as an error-level event.

## 0.17.0

### Minor Changes

- 08f6739: AI chat: make the Anthropic thinking config model-aware. Adaptive-thinking Claude models (Opus 4.5+, Sonnet 4.6) now use `thinking: { type: 'adaptive' }` plus `effort` (configurable via `aiChat.anthropic.effort`, default `high`) instead of the legacy `thinking: { type: 'enabled', budgetTokens }` shape, which those models reject with a 400 ("thinking.type.enabled is not supported for this model"). Older Claude models keep the legacy budget-based interface, and non-Claude models are unaffected. For adaptive-thinking models, `temperature`/`topP`/`topK` from `aiChat.sampling` are dropped (with a warning) since those models also reject them.

### Patch Changes

- 3871ed1: AI chat: forward chat-level errors to the error reporter (Sentry) so the "Network error" banner is no longer silent. Network-class failures (TypeError + /fetch|network/) are reported as warnings to avoid paging on flaky-wifi users; other errors are reported as errors. The error reporter is looked up via the api holder so the chat still works in environments where Sentry isn't wired up. On the backend, the chat route now logs a warning when the client socket closes before the SSE stream finishes, giving a server-side trace for mid-stream disconnects that previously left no log entry.

## 0.16.2

### Patch Changes

- e470ff5: Fix muster MCP connection by dropping the obsolete custom session-aware transport that broke against `@modelcontextprotocol/sdk` 1.29.0. Muster now uses the spec-standard `Mcp-Session-Id` header, which `@ai-sdk/mcp`'s built-in HTTP transport handles natively.

## 0.16.1

### Patch Changes

- 1ee4d77: Pin `ai` to a single version via root yarn resolution to fix `AI_TypeValidationError` when invoking MCP tools. The backend's `ai@6.0.177` emitted `tool-input-available` chunks with a new `toolMetadata` field that the client's older nested `ai@6.0.168` (pinned by `@ai-sdk/react`) rejected as an unrecognized key.

## 0.16.0

### Minor Changes

- b1fcc4f: Make AI chat sampling parameters configurable per installation. The plugin previously called `streamText()` without `temperature`, `topP`, `topK`, `seed`, `minP`, or `maxOutputTokens`, so the server's defaults applied -- which for vLLM means `temperature=1.0, top_p=1.0, top_k=-1, seed=null`. That is far too loose for a tool-using agent backed by a reasoning model and was the dominant cause of token-cost variance in production agent loops (same prompt, fresh chat, observed total-token spread of 22k / 607k / 22k across three runs against the same Qwen3 endpoint).

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

## 0.15.1

### Patch Changes

- ed6496f: Fix AI chat backend crash on every chat send. The `tools` field in the request body is `z.any().optional()`, so it arrives as `undefined` whenever the frontend does not register any client-side tools (the default when the chat UI uses assistant-ui's `AssistantChatTransport`). The previous implementation called `Object.entries(tools)` unconditionally, which threw `TypeError: Cannot convert undefined or null to object`, returning a 500 from `POST /api/ai-chat/chat` on every request. The browser surfaced this as "network error" and the LLM never reached the tool-merge step, so MCP-provided tools (muster, prometheus, kubernetes, …), skill tools, `getDate`, and the context-usage tool were also unreachable from chat. `frontendTools` now accepts `null`/`undefined` and treats them as an empty registry.
- ed6496f: Rebuild MCP clients when the underlying transport closes. The AI chat backend caches one `MCPClient` per server for 30 minutes, but the cache was holding on to clients whose StreamableHTTP transport had already been torn down by muster (idle timeout, server reset, …). Tool calls then failed with `MCPClientError: Attempted to send a request from a closed client` until the TTL expired, surfacing in the browser as a "network error" banner. The cache now chains into the transport's `onclose` callback and evicts the entry as soon as the connection drops, so the next request rebuilds the client cleanly. Tool execution also detects the same SDK error eagerly and marks the entry dead so a single failure -- not a 30-minute window -- triggers reconnection.

## 0.15.0

### Minor Changes

- 9cf3777: Add "Configure with AI" button to App Deployment template

## 0.14.0

### Minor Changes

- 9a27302: Make AI-chat skills configurable per deployment. The plugin still ships a default set of bundled skills, but deployments can now opt out via `aiChat.skills.bundled: false` and/or extend them with additional sources: `aiChat.skills.dir` (path to a directory of `*.md` files, e.g. mounted from a Kubernetes ConfigMap) and `aiChat.skills.inline` (an array of `{ name, content }` entries in `app-config`). Merge order is bundled → `dir` → `inline`, with later sources overriding earlier ones on name collision. When no skills end up loaded, the `listSkills` and `getSkill` tools are omitted from the toolset entirely.

## 0.13.0

### Minor Changes

- e5d4c19: Strip reasoning content parts from assistant messages older than the last two user turns before sending them to the model. Past thinking blocks don't need to round-trip per Anthropic guidance, and removing them reclaims up to ~10K tokens per past turn for Claude conversations. The current turn (and the one before it) keeps reasoning intact so Anthropic extended thinking + tool_use mid-loop continues to work.
- 8c05c63: Add `useBackstageUserToken` option to `aiChat.mcp` server entries. When set to `true`, the chat backend uses Backstage's `AuthService` to mint a token on behalf of the calling user, scoped to the built-in `mcp-actions` plugin, and sends it to the MCP server as `Authorization: Bearer <token>`. This lets the in-process `mcp-actions` MCP server run actions as the logged-in user, so user-context tools like `auth.who-am-i` work without configuring a static external-access token.

  Remove the custom `getCurrentUserInfo` agent tool. It is superseded by the upstream `auth.who-am-i` tool exposed by the `mcp-actions` MCP server, which returns a superset of the same information.

## 0.12.0

### Minor Changes

- c44ac72: Add a `getDate` tool to the AI agent that returns the current date and time as an ISO 8601 string with seconds and UTC timezone offset.
- 69ab321: Replace older tool outputs in the AI chat with `[Old tool result content cleared]` once cumulative tool I/O past the most recent two user turns exceeds a budget. Mirrors OpenCode's continuous prune. Tunable via `aiChat.pruning.reservedTokens` (default 20000) and `aiChat.pruning.minimumSavingsTokens` (default 10000); `getSkill` results stay verbatim.
- 3953b15: Persist conversations to the database. Adds Knex migrations for the conversations table and a message preview column, a `ConversationStore` service, and conversation routes (CRUD + list).

### Patch Changes

- 0311382: Request token usage from OpenAI-compatible streaming responses (vLLM/KServe) so `getContextUsage` can report context size, output tokens, and cost. Sends `stream_options: { include_usage: true }` on the chat-completions path.
- 3953b15: Reject empty title in `PATCH /conversations/:id/title` with HTTP 400.
- 42fc0ea: Clarify tool use in muster system prompt part, to avoid calling internal tools via muster's call_tool tool

## 0.11.1

### Patch Changes

- d8d8e7b: Flush SSE chunks through compression middleware so streamed AI responses
  reach the client in real time instead of arriving as a single batch.

## 0.11.0

### Minor Changes

- 9c6edac: Stream reasoning tokens from OpenAI-compatible models (vLLM) to the chat UI.

  When `aiChat.openai.api: chat` is configured (the vLLM/llama.cpp/SGLang
  path), the backend now talks to the model via `@ai-sdk/openai-compatible`
  instead of `@ai-sdk/openai`'s chat-completions client. The
  openai-compatible provider understands the `delta.reasoning` and
  `delta.reasoning_content` SSE fields that these servers emit when a
  reasoning parser is enabled (e.g. vLLM's
  `--reasoning-parser nemotron_v3` for Nemotron-Super), and forwards them
  as proper LanguageModelV3 reasoning stream parts. The OpenAI Responses
  path (`aiChat.openai.api: responses`, the default for real OpenAI),
  Azure, and Anthropic flows are unchanged.

  Also unconditionally renders the `Reasoning` and `ReasoningGroup`
  assistant-ui slots in `Thread.tsx` (previously gated behind the
  `ai-chat-verbose-debugging` feature flag). Without the slots, the
  streamed reasoning was silently dropped on the frontend even when the
  backend emitted it -- the chat just showed the "Thinking..." spinner
  for the full reasoning phase and then a sudden burst of answer text.

  Visible effect: with a reasoning-capable model the user now sees a
  collapsible "Reasoning" block that streams in token-by-token starting
  within ~500ms of pressing send, followed by the final answer.

## 0.10.2

### Patch Changes

- 95e2814: Fix AI chat silently producing empty replies whenever the model uses a tool.

  Since the upgrade to `ai` v6 (PR #1160), `streamText` defaults to
  `stopWhen: stepCountIs(1)`, which terminates the assistant turn right after
  the first tool call -- before the model is given a chance to consume the
  tool result and produce a user-facing answer. The chat UI sees the stream
  finish with `finishReason: "tool-calls"` and no text, so the spinner just
  disappears.

  Set `stopWhen: stepCountIs(20)` so the agent loop runs to completion, and
  expose the cap as a new optional `aiChat.maxSteps` config (default `20`).

  Also add an optional `aiChat.openai.api` config (`"responses"` (default) or
  `"chat"`) so OpenAI-compatible servers that haven't implemented the Responses
  API can still be targeted via `/v1/chat/completions`. This is required for
  vLLM, where posting `function_call_output` items back to `/v1/responses`
  crashes the API server with `KeyError: 'role'` and the AI SDK then surfaces
  `"Failed after 3 attempts. Last error: 'role'"` to the chat client.

- 143bd4b: Strip stale `list_tools` / `list_core_tools` tool results from conversation history before they are resent to the model. The most recent result for each tool is kept intact; older occurrences are replaced with a short placeholder. A single `list_tools` call from a muster MCP server can cost ~20K tokens, and without compaction it was replayed on every subsequent turn.
- 6e73b60: Add optional `aiChat.systemPrompt` config to override the built-in AI chat system prompt. MCP-specific additions (muster prompt, failed-server notes) are still appended.

## 0.10.1

### Patch Changes

- 9d3c760: Fix MCP tool names with dots breaking AI SDK. Sanitize MCP tool names to match AI SDK's required pattern by replacing invalid characters like dots with underscores.

## 0.10.0

### Minor Changes

- 35dc69b: Improvements on the getContextUsage tool in AI chat, adding cost estimate, changing token calculation

### Patch Changes

- b3e9dd7: Reject attachments in AI chat

## 0.9.2

### Patch Changes

- 404399e: Truncate MCP session IDs in log messages to avoid logging full UUIDs.

## 0.9.1

### Patch Changes

- 38bcb3c: Reduce system prompt instructions for muster

## 0.9.0

### Minor Changes

- 93e31f7: Add custom session header support for MCP servers that use non-standard session headers (e.g. `X-Muster-Session-ID`).

## 0.8.1

### Patch Changes

- 55f532b: Improve logging in ai-chat. Add conversation ID, better differentiation of log levels.

## 0.8.0

### Minor Changes

- 06dc087: Add support for Azure OpenAI
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- d6fda46: Truncate generated tool name to 64 characters
- cb36dac: Fix config visibility annotations to prevent sensitive backend configuration from being exposed to the frontend.

## 0.7.0

### Minor Changes

- 5850ce3: Add tool to display context window usage

## 0.6.0

### Minor Changes

- 8e87dfe: Add MCP client cache with TTL-based eviction for persistent connections across requests.

### Patch Changes

- 8e87dfe: Fix tool call sanitization for AI SDK v6 compatibility: add missing `input` field fallback and handle array-based tool-result messages.
- 8e87dfe: Add muster-specific system prompt with instructions for tool discovery, authentication, and calling conventions.

## 0.5.1

### Patch Changes

- 2f059dd: Modify system prompt to prevent guessing of hostnames for links in the chat

## 0.5.0

### Minor Changes

- a68a2b2: Add authentication provider support and multi-installation features for MCP servers
  - Add `authProvider` configuration option to inject authentication tokens from request headers into MCP server requests
  - Add `installation` option to prefix tool names and descriptions for multi-installation setups
  - Add MCP resources loading and expose them as callable tools
  - Add `deduplicateToolCallIds` utility to fix Anthropic API errors with duplicate tool call IDs
  - Add TypeScript config schema for AI chat configuration

## 0.4.0

### Minor Changes

- 061ff6d: Add tool getCurrentUserInfo to agent to fetch info on the current user
- b61a7b3: Add skills to agent

### Patch Changes

- b32909b: Handle MCP connection failures gracefully

## 0.3.0

### Minor Changes

- 0384d69: Update ai-sdk packages to v6
- 98f9ffb: Enable thinking for anthropic model.

### Patch Changes

- f81c921: Remove react-ai-sdk dependency.

## 0.2.3

### Patch Changes

- 24a4c48: Increase request size limit

## 0.2.2

### Patch Changes

- cba1afd: Fix dependency issue.

## 0.2.1

### Patch Changes

- 027a200: Fix React dependency.

## 0.2.0

### Minor Changes

- 1a75706: Add AI Chat plugin.
