---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

The Usage screen's time window reads "Last [7 | 30 | 90] days" under a "Time
range" label, so only the number is picked. It is a light field box as tall as
the Environment select beside it, with the same edge and radius, and the two
line up on the same label and box edges. The selected window has a light fill
and an edge in the link colour instead of a solid navy block. Screen readers
hear a "Time range" radio group with options named "Last 7 days", "Last 30
days" and "Last 90 days".

`ui-react` exports the control as `TimeWindowPicker`. `agent-platform-common`
drops `usageWindowLabel`, which nothing uses any more.
