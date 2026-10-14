---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-muster': patch
---

The Usage time range applies everywhere. The Overview's "Your sessions" tile counts the selected window, and Your sessions shows sessions and tool calls for 7 days too: the session-usage route now reports `toolCalls` and `lastActiveSessions` per day. The Connectors view asks muster for the selected window instead of a fixed 30 days. The per-day chart no longer draws a bar for tomorrow.
