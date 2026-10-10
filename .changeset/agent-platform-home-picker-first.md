---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The new-session home's composer now leads with the agent: the picker is the
box's first row ("First choose an agent", then "Agent"), with the message
field under it. A `?agent=<installation>/<namespace>/<name>` link preselects
that agent when it can be started. `NewSessionComposer` gains
`pickerPlacement` and `pickerLabel`; the Slack promo stays under the composer.
