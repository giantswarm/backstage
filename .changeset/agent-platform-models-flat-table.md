---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Models tab's "Model configs" view no longer splits the list into one
section per installation under "All installations". Every kagent
installation in scope got a heading and a status line of its own — "no models
here" for the ones with none — so the models themselves were pushed down the
page and spread over several small tables that could not be sorted or scanned
together.

The view is now one flat table under every scope, the same table a pinned
installation and a single-installation portal already showed. The
**Installation** column, the table's initial sort, tells the rows apart; an
installation without a ModelConfig simply has no row, and one that could not
be read is still called out in the warning card below the table.

With this the Agents, Sessions and Models lists all read the same way.
