---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

A session that waits at `auth-required` on an MCP server's sign-in link (kagent's HITL `url_elicitation_request`, sent by runtimes that relay MCP URL elicitations, such as muster's sign-in link from 5.53.0 on) shows a sign-in card instead of the composer's question card: the server that asked, its message, _Sign in_ and _Not now_. Muster returns the sign-in's tab to the session and the agent continues on its own (`url_elicitation_response` `accept`); _Not now_ declines. `readUrlElicitationRequest` reads the request off a status message.
