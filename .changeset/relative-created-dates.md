---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Created and connection times read as relative dates, the local date and time
on hover. The agent page says "Created 3 days ago" once, in the facts beside the
Overview, no longer in its header or in Technical details. A connector's "Added" fact says how long ago it was
added instead of a fixed UK-format UTC date. Its Health block ("Last
connected", "Next retry") and the Instances tab's "Last connected" column drop
the browser-locale timestamp and show the exact time on hover; a retry time
that has passed is no longer shown as the next one.

A relative `DateComponent` (and `getRelativeDate`) shows a value that does not
parse as given, as the absolute one already did, instead of throwing.
