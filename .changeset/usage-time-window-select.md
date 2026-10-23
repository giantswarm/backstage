---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

The Usage screen's time window is a select labelled "Time range" with the
options "Last 7 days", "Last 30 days" and "Last 90 days", in place of the three
bold "7 days | 30 days | 90 days" buttons. Beside the Environment select it has
the same label, box, edge, radius and height, and the two line up. On Your
sessions, a window longer than kagent keeps is a disabled option that says why
under its name ("kagent keeps 30 days of session usage"), which screen readers
read with it; the note that said so beside the control on phones is gone.

`ui-react` exports the control as `LastDaysSelect`.

`agent-platform-common` removes the export `usageWindowLabel`, which nothing
uses any more. Code that imports it must name the window itself.
