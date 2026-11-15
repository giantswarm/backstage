---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

Allow larger toolsets using the installed chart's selector cap and Muster's validation. Block Continue only when Muster refuses the toolset; when Muster does not answer, show the failure with a retry and let the person continue. Send selections as JSON so Unicode names fit the transport.
