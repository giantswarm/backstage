---
'app': patch
'backend': patch
---

Cache-bust custom branding logo URLs by appending the asset's mtime as a `?v=` query string, so replaced logos appear immediately instead of being served stale from the browser cache.
