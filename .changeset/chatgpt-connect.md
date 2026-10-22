---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs-node': minor
---

A person connects their own ChatGPT subscription in the portal. The sign-in
dialog lists a row per provider App muster keeps, beside the MCP servers: not
connected, waiting for the code, connected or failed. _Connect_ shows OpenAI's
one-time code with a copy button and its link, opens OpenAI's device page in a
new tab, and turns _Connected_ without a reload; _Disconnect_ drops the grant.
The agent chat of an agent whose model is the person's own ChatGPT login sends
no turn until the person has connected it, shows the connect prompt instead,
and sends a new session's first message once they have. The model is named
"ChatGPT (your subscription)".
Profile and settings lists the person's connections, where they connect or
disconnect one without a feature asking.
