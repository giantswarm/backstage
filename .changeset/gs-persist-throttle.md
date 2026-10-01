---
'@giantswarm/backstage-plugin-gs': patch
---

Write the persisted react-query cache to localStorage at most every 30 seconds
instead of every second, so polling queries no longer re-serialise the whole
cache on the main thread once a second.
