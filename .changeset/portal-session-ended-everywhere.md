---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

When the portal refuses the person's session token, the Sessions pages, the session chat, the agent's sessions, toolchains, workspaces, served models, GPU node pools and the Tools step say that the portal session ended, with a Sign in again button, instead of "Failed user token verification". This covers the kagent routes and the model-manager, cluster-manager, toolchain-manager and workspace-manager reads and the tool catalogue reads through muster. The agent-platform backend answers an installation's refusal of the person's token (kagent, Mimir) and a missing installation token as `InstallationAuthenticationError` (401), so these pages keep that refusal's own message.
