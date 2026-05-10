---
'@giantswarm/backstage-plugin-ai-chat': patch
---

AI chat: always log network-level diagnostics (request URL, response status / headers, fetch errors, SSE stream lifecycle including premature termination) to the browser console so a "Network error" banner can be triaged from a user report without requiring the `ai-chat-verbose-debugging` feature flag. Verbose payload-level logging (messages, system prompt, tool schemas, per-event SSE detail) remains gated on the feature flag in non-production builds.
