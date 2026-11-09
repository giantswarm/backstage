---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'app': patch
---

When a sign-in in another browser ends the portal session in this one (Dex refuses the refresh with "already been claimed by another client"), the Agent Platform shows "You signed in from another browser" with a "Sign in again" button. Meanwhile the Customize tabs leave their counts out, the Connectors and Workflows tabs say they could not read the list instead of "None of your environments runs muster", and the sessions rail asks for a sign-in instead of "No sessions yet". The gs plugin adds `useMainSessionEnd` and `GSAuthProvidersApi.getMainSessionEnd`.
