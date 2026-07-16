---
'@giantswarm/backstage-plugin-ai-chat-backend': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

Migrate the AI chat backend from the `ai@6` generation of the Vercel AI SDK to
`ai@7` and the matching `v4` providers.

- Bump `ai` → `^7`, `@ai-sdk/anthropic`/`@ai-sdk/openai`/`@ai-sdk/azure` → `^4`,
  `@ai-sdk/openai-compatible` → `^3`, and `@ai-sdk/mcp` → `^2` (in
  `ai-chat-backend`, `gs-node`, and `muster-backend`).
- Drop the `@ai-sdk/mcp` SSE transport patch: the fix (treating an `undefined`
  SSE `event` field the same as `event: "message"`) is upstreamed in
  `@ai-sdk/mcp@2`.
- `ai@7` rejects `role: "system"` messages inside `messages`/`prompt` by
  default; the Anthropic prompt-caching path deliberately puts a system message
  in the array, so it now opts back in via `allowSystemInMessages: true`.
- `ai@7`'s `ToolExecutionOptions` gained a required `context` field; the muster
  meta-tool executor passes `context: undefined`.

The frontend (`ai-chat`) stays on `ai@6` because `@assistant-ui/react-ai-sdk`
has no `ai@7` release yet. The UI-message-stream wire protocol is unchanged
between v6 and v7, so the `ai@7` backend streams to the `ai@6` frontend
unchanged. Root `package.json` pins only the backend to 7.x via a scoped
`resolutions` override (`.../ai-chat-backend/ai`); there is no unscoped `ai`
resolution (an unscoped pin would override the scoped one in Yarn 4). The
frontend stays on 6.x via its own `ai@^6` range, kept there by the Renovate
`ai`/`@ai-sdk/*` major-hold.
