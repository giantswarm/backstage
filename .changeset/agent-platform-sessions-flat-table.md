---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Sessions tab no longer splits the list into one section per installation
under "All installations". Every installation in scope got a heading and a
status line of its own — "no sessions here" for the many that have none — so
the sessions themselves were pushed down the page and spread over several
small tables that could not be sorted or scanned together.

The tab is now one flat table under every scope, the same table a pinned
installation and a single-installation portal already showed. The
**Installation** column tells the rows apart, and the table's own sort —
last activity, newest first — puts the conversation you were just in at the
top whichever installation it ran on. An installation without sessions
simply has no row, and one that could not be read is still called out in the
warning card below the table. The per-page search field is gone with the
groups: the table's own field is the one place to type.

This is the same flattening the Agents tab already had. The Models tab keeps
its per-installation groups.
