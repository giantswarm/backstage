---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Fix AI chat backend crash on every chat send. The `tools` field in the request body is `z.any().optional()`, so it arrives as `undefined` whenever the frontend does not register any client-side tools (the default when the chat UI uses assistant-ui's `AssistantChatTransport`). The previous implementation called `Object.entries(tools)` unconditionally, which threw `TypeError: Cannot convert undefined or null to object`, returning a 500 from `POST /api/ai-chat/chat` on every request. The browser surfaced this as "network error" and the LLM never reached the tool-merge step, so MCP-provided tools (muster, prometheus, kubernetes, …), skill tools, `getDate`, and the context-usage tool were also unreachable from chat. `frontendTools` now accepts `null`/`undefined` and treats them as an empty registry.
