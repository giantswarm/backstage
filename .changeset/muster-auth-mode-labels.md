---
'@giantswarm/backstage-plugin-muster': patch
---

Every place that names an MCP server's auth mode uses the same name: the servers table, the server detail panel (a new **Mode** row above the auth type), the registration wizard's authentication and review steps, and the edit-blocked tooltip. The modes read **No authentication**, **Own account (OAuth sign-in)**, **Platform SSO (forwarded token)**, **AWS request signing (SigV4, shared identity)**, **Token exchange (cross-cluster SSO)** and **Unrecognised authentication**. The review step repeats the shared-identity warning for a SigV4 server, and the detail panel shows the settings an anonymous server still carries.
