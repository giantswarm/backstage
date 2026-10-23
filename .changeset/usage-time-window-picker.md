---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

The Usage screen's time window reads "Last [7 | 30 | 90] days" under a "Time
range" label, so only the number is picked. It is a light field box as tall as
the Environment select beside it, with the same edge, radius and hover, and the
two line up on the same label and box edges. The selected window has a light
fill and an edge in the link colour instead of a solid navy block; keyboard
focus draws a ring of its own inside the option and the field's focus halo
around the box. Clicking the "Time range" label focuses the selected window.
Screen readers hear a "Time range" radio group with options named "Last 7
days", "Last 30 days" and "Last 90 days".

`ui-react` exports the control as `LastDaysPicker`, with
`LAST_DAYS_PICKER_CLASS_NAMES` for an app stylesheet to restyle it by.

`agent-platform-common` removes the export `usageWindowLabel`, which nothing
uses any more. Code that imports it must name the window itself.
