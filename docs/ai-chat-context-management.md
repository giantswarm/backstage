# Investigation: AI Chat Plugin Context Management

## Context

The `ai-chat` plugin integrates assistant-ui (`@assistant-ui/react` v0.12.25, `@assistant-ui/react-ai-sdk` v1.3.19) with the Vercel AI SDK (`ai` v6.0.161) to provide an AI assistant in the Backstage portal. This investigation documents how context is managed — what gets sent to the model, what grows unboundedly, and what controls (or lack thereof) exist.

## Key Files

| File | Role |
|------|------|
| `plugins/ai-chat/src/hooks/useChatSetup.ts` | Frontend runtime setup, transport config |
| `plugins/ai-chat-backend/src/router.ts` | Backend `/chat` endpoint, `streamText()` call |
| `plugins/ai-chat-backend/src/tools/contextUsageTools.ts` | Token usage tracking (informational only) |
| `plugins/ai-chat/src/components/AiChat/assistant-ui-components/ContextUsageDisplay.tsx` | Context usage UI card |
| `plugins/ai-chat-backend/src/utils/sanitizeMessages.ts` | Strips file/image parts |
| `plugins/ai-chat-backend/src/utils/deduplicateToolCallIds.ts` | Anthropic tool ID fix |
| `plugins/ai-chat-backend/systemPrompt.md` | System prompt (~3-4K tokens) |
| `plugins/ai-chat-backend/systemPromptMuster.md` | Conditional muster addendum |

---

## Findings

### 1. No Compaction Mechanism

**There is no compaction, summarization, truncation, or sliding window.** The full conversation history is sent with every request.

- Frontend: `useChatRuntime` stores all messages in memory. On each user message, `AssistantChatTransport` POSTs the entire `messages` array to the backend.
- Backend: `convertToModelMessages(messages)` converts all UIMessages to ModelMessages and passes them to `streamText()` (router.ts:210-246).
- When the context window fills up, the API call fails. The only recovery is starting a new conversation (`setRuntimeKey(prev => prev + 1)` in `AiChatDrawerProvider.tsx`).

**The Vercel AI SDK does offer a `prepareStep` callback** (documented in their agents docs) that receives all accumulated messages and could be used to prune old messages while keeping system instructions. This is not utilized.

**The AI SDK also supports language model middleware** (`wrapLanguageModel` with `transformParams`) which could intercept and truncate messages before they reach the provider. This is not utilized either.

### 2. Reasoning/Thinking Output Is Sent Back in Full

**All previous reasoning output is included in subsequent requests.**

- Anthropic thinking is enabled with `budgetTokens: 10000` (router.ts:264).
- The Vercel AI SDK's `convertToModelMessages()` converts UIMessage parts including `reasoning` parts back into model messages. This was confirmed by reading the AI SDK source code: reasoning UI parts are mapped to `{ type: 'reasoning', text: part.text }` content blocks.
- This means every previous thinking block (up to 10K tokens each) is sent back to the model on every subsequent turn.
- For a 10-turn conversation with heavy reasoning, this alone could consume 100K+ tokens of context.
- **Neither assistant-ui nor the AI SDK filters reasoning from history by default.** There is no option to include only the last message's reasoning or to strip it entirely.
- **Anthropic's own guidance** suggests that thinking blocks are for transparency, not for context continuity — they need not be sent back. Stripping them from older turns would be safe and could save significant context.

### 3. Multi-Step Behavior and the Frontend Auto-Send Loop

The `streamText()` call does not set `maxSteps`. In AI SDK v6, the default `maxSteps` is **1** (single generation step per request). However, the **frontend drives an external agentic loop** via `shouldSendAutomatically` (useChatSetup.ts:29-58): when the last assistant message has completed tool calls, the frontend automatically re-sends the entire conversation. This is effectively an **unbounded agentic loop** driven by the frontend:

1. User sends message (full history sent)
2. Model responds with tool calls
3. Tool results stream back
4. Frontend auto-sends again (full history + tool calls + results)
5. Model responds (possibly with more tool calls → goto 3)

Only `getContextUsage` is exempted from auto-send (via `SELF_RENDERING_TOOLS`). All other tool calls trigger another round-trip with the full, growing conversation.

**Per the Vercel AI SDK docs**, `prepareStep` can be used to prune messages between steps to manage context. The SDK also provides `isStepCount(N)` for stop conditions. Neither is used here since the loop is frontend-driven, not backend-driven.

### 4. No maxTokens Output Limit

No `maxTokens` parameter is passed to `streamText()`. The model can generate arbitrarily long responses (subject only to provider limits). Combined with the 10K thinking budget, a single response could be very large.

### 5. Skill Content Injection Grows Context Permanently

Six skill markdown files exist in `plugins/ai-chat-backend/skills/` totaling ~11KB raw:
- `backstage-catalog.md`, `grafana.md`, `giant-swarm-platform.md`, `giant-swarm-documentation.md`, `backstage-clusters.md`, `backstage-portal.md`

When the model calls `getSkill`, the full markdown content becomes a tool result that persists in conversation history for all subsequent turns. The system prompt instructs the model to proactively use `getSkill` (e.g., "Use the `getSkill` tool to fetch information about `giant-swarm-platform` for more details. This is recommended in most cases"). Multiple skill fetches compound context growth.

### 6. Token Tracking Is Informational Only (No Enforcement)

The `getContextUsage` tool (contextUsageTools.ts) tracks:
- Input tokens (= current context size) per step
- Cumulative output tokens across the conversation
- Cache read/write tokens (Anthropic prompt caching)
- Reasoning tokens

This data is displayed in a UI card (ContextUsageDisplay.tsx) with a progress bar showing context window percentage. **But there is no enforcement** — no warning when approaching limits, no automatic action, no graceful degradation.

### 7. Tool Definitions Consume Context on Every Request

All tools are sent with every request (router.ts:249-260):
- Frontend tools (user-provided)
- All MCP tools from all connected servers
- MCP resource tools
- Skill tools (`listSkills`, `getSkill`)
- User tools (`getCurrentUserInfo`)
- Context usage tool (`getContextUsage`)

Tool schemas are part of the context window. With many MCP servers connected, this baseline overhead could be significant. There is no tool filtering or dynamic tool selection based on conversation state.

### 8. System Prompt Grows Dynamically

The system prompt starts with `systemPrompt.md` (~3-4K tokens) and can grow with:
- `systemPromptMuster.md` appended when the muster MCP server is connected
- Failure notices for each disconnected MCP server

The system prompt uses Anthropic ephemeral cache control (router.ts:233), which helps with **cost** (cache hits are cheaper) but does **not** reduce context size.

### 9. Tool Results Accumulate Without Summarization

Tool results from all previous turns are preserved in full. This is particularly impactful for:
- **Kubernetes MCP tools**: Can return large JSON payloads (cluster descriptions, pod lists, etc.)
- **Skill tools**: `getSkill` returns entire markdown documents (e.g., `giant-swarm-platform.md`)
- **Metrics tools**: Prometheus query results can be large

There is no mechanism to summarize old tool results or replace them with summaries.

### 10. Conversation Persistence Is Ephemeral

- Frontend: Messages live in assistant-ui's in-memory runtime state. A page refresh loses the conversation.
- Backend: Only token usage is tracked in memory (24-hour TTL). No conversation persistence.
- Conversation ID is a UUID generated on first message per session.

### 11. No Request Abort/Cancellation

The `abortSignal` in `streamText()` is explicitly set to `undefined` (router.ts:248). If a user navigates away or the connection drops during a long streaming response, the backend continues processing. The frontend does cancel pending tool calls when the user sends a new message (assistant-ui built-in behavior).

### 12. No Subagent Architecture (Single Flat Context)

The Vercel AI SDK supports **subagents** — specialized agents invoked as tools that run with **independent context windows**. A subagent can consume hundreds of thousands of tokens doing heavy exploration, while the parent agent only sees a compact summary (via `toModelOutput`). This is the primary architectural mechanism for context isolation in the AI SDK.

The current ai-chat plugin uses a single flat agent — all tool calls, results, reasoning, and conversation history share one context window. This means:
- A single MCP query returning a large Kubernetes resource list permanently inflates the main context
- There is no way to "offload" exploration work to a separate context
- The model must carry the full weight of all prior tool interactions on every subsequent turn

Subagents would allow delegating exploration tasks (e.g., "investigate this cluster's pods") to isolated contexts that return only summaries, dramatically reducing context growth in the parent conversation.

### 13. Cost Implications

Without compaction:
- **Anthropic models**: Prompt caching helps (cache reads at ~90% discount), but the system prompt cache only covers the system prompt prefix. User messages and tool results are not cached.
- **Growing input tokens**: Each turn re-sends everything, so input token costs grow quadratically with conversation length.
- **The `estimateCost` in ContextUsageDisplay.tsx** only shows the latest request's cost, not cumulative conversation cost.

---

## Context Growth Trajectory (Illustrative)

For a typical agentic interaction (e.g., "investigate why my deployment is unhealthy"):

| Component | Tokens per occurrence | Frequency | Growth pattern |
|---|---|---|---|
| System prompt | ~2-3K | Every request (constant) | Flat (cached) |
| Tool definitions | Hundreds to thousands | Every request (constant) | Flat |
| User messages | ~50-500 | Per turn | Linear |
| Assistant text output | ~200-2000 | Per turn | Linear |
| Thinking/reasoning | Up to 10,000 | Per turn (Claude only) | Linear, steep |
| Tool calls | ~50-200 each | Per step | Linear |
| MCP tool results | ~500-10,000+ each | Per step | Linear, steep |
| Skill content | ~500-700 each | Per fetch, persists forever | Step function |

A 15-turn conversation with Claude involving 2-3 MCP tool calls per turn (returning K8s resources), 2 skill fetches, and full thinking could exceed 200K tokens. The 1M context models (claude-sonnet-4-6, opus-4-6) provide more runway but the fundamental unbounded growth remains.

---

## Summary of Gaps

| Aspect | Current State | Risk |
|--------|--------------|------|
| Context compaction | None | Context overflow on long conversations |
| Reasoning in history | All sent back | ~10K tokens per thinking turn accumulate |
| maxSteps | Default 1, but frontend auto-send loop is unbounded | Runaway tool-calling cycles |
| maxTokens | Unlimited | Large single responses |
| Token limit enforcement | Display only | No prevention of context overflow |
| Tool definitions | All sent always | Baseline context overhead |
| Tool result accumulation | Full history | Large payloads persist forever |
| Old message pruning | None | Linear growth, no ceiling |
| Request cancellation | Disabled | Wasted compute on abandoned requests |
| Subagents | Not used — single flat context | All exploration bloats main context |
| Cost tracking | Per-request only | No cumulative cost awareness |

---

## Potential Improvements (for reference)

1. **Subagents for context isolation**: The Vercel AI SDK supports **subagents** — specialized agents invoked via tool calls that run in **independent context windows**. A subagent can consume hundreds of thousands of tokens doing exploration (e.g., fetching and analyzing Kubernetes resources), while the parent agent only sees a focused summary via `toModelOutput`. This is the most architecturally significant context management lever available:
   - Heavy MCP tool exploration could be delegated to subagents
   - Each subagent starts with a fresh context window — its work doesn't bloat the parent conversation
   - The parent only consumes the summary, keeping the main conversation lean
   - Multiple subagents can run in parallel for different investigation tracks
   - This would require moving from the current flat single-agent architecture to a parent/subagent model

2. **Context compaction**: Use AI SDK middleware (`transformParams`) or a custom message preprocessing step before `streamText()` to summarize or prune old messages when approaching a threshold (e.g., 70% of context window).

3. **Reasoning filtering**: Strip or summarize reasoning blocks from messages older than the last N turns. The `convertToModelMessages` output could be post-processed to remove `type: 'reasoning'` content from older assistant messages.

4. **Configure maxSteps**: Set an explicit `maxSteps` in the `streamText()` call (e.g., 10) to prevent unbounded tool loops, or add a loop counter to the frontend auto-send logic.

5. **Configure maxTokens**: Set output token limits to prevent unexpectedly large responses.

6. **Dynamic tool selection**: Only send tools relevant to the current conversation rather than all tools on every request.

7. **Tool result summarization**: After N turns, replace verbose tool results with summaries.

8. **Context window enforcement**: When `getContextUsage` shows >80% usage, proactively warn the user or automatically trigger compaction.

9. **Request abort signal**: Wire up `req.socket` close events to an `AbortController` so abandoned requests stop processing.

---

## Verification Approach

To verify these findings:
1. Start a conversation with the AI chat and make several tool calls (e.g., ask about Kubernetes resources)
2. After 5-10 turns, call `getContextUsage` to see token usage
3. Observe that input tokens grow monotonically with each turn
4. Check backend logs for `messageCount` in "Sending messages to API" debug entries
5. Verify reasoning tokens appear in context usage (if using Claude model)
