---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

The MCP server sign-in notice no longer opens the "Login Required" dialog: its background status read uses the current portal session only and stays quiet once that session has expired. While the notice is shown, pages reserve room under their last content (above the wizard footer and the session composer), so nothing stays hidden behind it on a phone.
