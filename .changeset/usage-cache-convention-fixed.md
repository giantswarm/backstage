---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Usage counts cache reads and writes inside input on every installation, as the gateway records them, instead of guessing per series whether input holds them. Token totals, the cache-read share, fresh input and the estimated cost no longer change with how a window's figures happen to compare.
