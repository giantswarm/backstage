---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Created and connection times read as relative dates, the local date and time
on hover. The agent page's header says "Created 3 days ago", and the Overview's
facts no longer repeat it. A connector's "Added" fact says how long ago it was
added instead of a fixed UK-format UTC date. Its Health block ("Last
connected", "Next retry"), also shown in the Instances tab's expanded row,
drops the browser-locale timestamp in parentheses.
