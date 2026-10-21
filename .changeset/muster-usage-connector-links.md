---
'@giantswarm/backstage-plugin-muster': minor
---

Usage → Connectors links each connector in its table to that connector's
Usage tab on the installation shown (`…/<installation>/<connector>/usage`),
over the same window: the link carries `?window=` (7 or 90 days; 30 is the
default and names none), the tab covers it, and its links keep it: **Open in
Usage** back, each tool's Usage tab (which covers it too) and that tab's way
back to the connector. Details stays on 30 days, which its label names. An
instance of a family links to the family's Usage tab, which lists each
instance's calls, since instances have no page of their own. A row no
connector page shows, such as a server since removed, stays plain text. The
table shows once the installation's connectors are read, so its names are
links from the start.
