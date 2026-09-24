---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

A card whose comparison is running shows a loading indicator, and Refresh runs the comparison
again. The tab opened on one skeleton standing in for the cards and the history, then
"Comparing with the definition…" was a small secondary line among lines of the same size, so a
card mid-comparison looked like one that was done; the comparison runs for up to half a minute
with no elapsed time and, cached until the page was left, no way to a fresh one but a reload.
Meanwhile the choices rendered from the schema's defaults ("Title: Dev Portal"), then flipped to
the record ("Backstage") as the comparison landed, with rows inserted above rows already read.
Now the tab's load and a comparison in flight show the house `LoadingIndicator`, the label
counting the seconds once ten have passed; the card holds the record back while the comparison
runs -- the header's phase and the indicator, nothing else -- so the record appears once,
complete, and the choices come from the comparison's inputs alone, never a schema default; a
Refresh button on every card (icon and text, "Refresh comparison") re-runs the comparison in
place, the caching otherwise unchanged.
