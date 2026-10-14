---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

AI chat leaves the muster `aiChat.mcp` entry (named per `muster.serverName`) out when it has no `authProvider`, instead of handing the model muster's tools under muster's shared identity.
