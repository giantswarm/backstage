---
'@giantswarm/backstage-plugin-muster': patch
---

Every place that names an MCP server's auth mode uses the same name: the servers table, the server detail panel (a new **Mode** row above the auth type), the registration wizard's authentication and review steps, and the edit-blocked tooltip. The modes read **No authentication**, **Own account (OAuth sign-in)**, **Platform SSO**, **AWS request signing (SigV4)**, **Token exchange (cross-cluster SSO)** and **Unrecognised authentication**.
