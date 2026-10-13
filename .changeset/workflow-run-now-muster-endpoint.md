---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

A workflow's page has **Run now** in its header: the workflow's arguments in a
dialog, run as the signed-in person, with the result in place. A finished run
refreshes the page's last run and statistics. Without a muster session the
button is disabled and says why. The definition stays read-only.

Customize · Connectors shows the environment's muster MCP endpoint with a copy
button, for connecting an MCP client of one's own.

`ui-react` exports `PHONE_FULL_SCREEN_DIALOG`, the full-screen phone styling
for a bui `Dialog` that takes input.
