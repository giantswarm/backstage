---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agents tab no longer splits the list into one section per installation
under "All installations". Every installation in the inventory got a heading
and a status line of its own — "no agents here" for the many that run none —
so the agents themselves were pushed down the page and spread over several
small tables that could not be sorted or scanned together.

The tab is now one flat table under every scope, the same table a pinned
installation and a single-installation portal already showed. The
**Installation** column, the table's initial sort, tells the rows apart with
the home installation first; an installation without agents simply has no
row, and one that could not be read is still called out in the warning card
below the table. The Sessions and Models tabs keep their per-installation
groups.
