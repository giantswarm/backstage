---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Serving page lists the running models first, then the ones that need
attention, then the ones not running. Each backend's table opens sorted by
Status in that order — Ready; Not serving, Not ready, Pending and Stopping;
Idle (an agent on it still works, the first request loads it), Downloading
and Available — with the name as the tiebreaker. It opened sorted by name,
and a sort by Status followed the alphabet of the state words, so a broken
model could sit between two available ones. A person opening the page now
reads what works, then what to fix, then what could be served, and a host's
many idle models never push the broken ones down; sorting by Status
descending turns the order around.
