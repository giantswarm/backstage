---
'@giantswarm/backstage-plugin-muster': minor
---

Usage → Connectors links each connector in its table to that connector's
Usage tab on the installation shown (`…/<installation>/<connector>/usage`),
over the same window: the link carries `?window=` (7 or 90 days; 30 is the
default and names none), the tab covers it, and the tab's **Open in Usage**
carries it back. Details and a tool's page stay on 30 days. An instance of a
family links to the family's Usage tab, which lists each instance's calls,
since instances have no page of their own. A row no connector page shows,
such as a server since removed, stays plain text. The table shows once the
installation's connectors are read, so its names are links from the start.
