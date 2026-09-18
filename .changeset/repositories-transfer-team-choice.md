---
'@giantswarm/backstage-plugin-repositories': minor
---

The row action _Transfer_ asks for the receiving team as a choice instead of
a typed GitHub slug: the same teams _Create repository_ offers -- the
person's own first, labelled so, then every team the inventory knows a
declaration of -- less the giving team, which cannot take what it gives. The
teams are read the way the Create form reads them (`get_info`, the `mine`
listing and the whole inventory, shared in one hook and answered from the
Repositories page's cache); the receiving team's member still approves, and
the giving team is told.
