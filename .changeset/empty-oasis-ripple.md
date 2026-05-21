---
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

AI chat: forward chat-level errors to the error reporter (Sentry) so the "Network error" banner is no longer silent. Network-class failures (TypeError + /fetch|network/) are reported as warnings to avoid paging on flaky-wifi users; other errors are reported as errors. The error reporter is looked up via the api holder so the chat still works in environments where Sentry isn't wired up. On the backend, the chat route now logs a warning when the client socket closes before the SSE stream finishes, giving a server-side trace for mid-stream disconnects that previously left no log entry.
