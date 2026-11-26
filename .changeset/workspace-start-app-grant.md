---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Starting a Session in a workspace without the grant of the workspace-manager's provider App now shows the sign-in card for the App instead of nothing: muster answers that call with its `auth_required` error naming the Apps, which muster-backend now passes on in its 401 (`error.apps`). The toolchain pages read the same answer as `grant_required` and show their sign-in. A start in a workspace that fails any other way now says "Session not started" with the reason. In the sign-in card, "Start without workspace" now sits directly beside the sign-in button, with the hint under both.
