---
'@giantswarm/backstage-plugin-agent-platform': patch
---

`Update skills` on an agent's page shows the convergence progress again, and no
longer leaves it behind to appear on a later visit.

The detail page reads the write it should watch out of the router state. That
state was only read once, when the page mounted — but `Update skills` runs from
the page itself and navigates to the URL it is already on, so nothing unmounts
and the write was never seen: no "Updating skills…" alert ever appeared, despite
the toast saying the update had been accepted. Nothing having been read, nothing
was cleared either, so the state survived in the history entry and a later reload
of that URL surfaced the progress out of nowhere, for an update long finished.

The handoff is now picked up whenever it appears, not only at mount. The create
flow is unaffected — it navigates to a different page, so it always worked.
