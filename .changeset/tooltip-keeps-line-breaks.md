---
'@giantswarm/backstage-plugin-ui-react': patch
---

`InfoHint`'s tooltip keeps a multi-line hint's line breaks and wraps a long
unbroken word, as its popover already did: a `StatusHint` with several
sentences shows each on a line of its own instead of one run-on paragraph, and
a long model id stays inside the tooltip.
