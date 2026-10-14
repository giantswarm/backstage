---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': patch
---

Add the "Use your agents right in Slack" banner to the new-session home, shown
only where a platform admin enables it with the new app-config key
`agentPlatform.integrations.slack: true` (off by default; an unconfigured portal
renders and reads nothing). Each person can dismiss it for good; the dismissal
is stored in their user settings. The gs-backend signed-in config now passes
`agentPlatform.integrations.slack` to the browser.
