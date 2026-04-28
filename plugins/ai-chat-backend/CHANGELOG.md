# @giantswarm/backstage-plugin-ai-chat-backend

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
