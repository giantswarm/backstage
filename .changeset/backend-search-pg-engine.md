---
'backend': patch
---

Search: the index lives in the search plugin's Postgres database (`@backstage/plugin-search-backend-module-pg`), so it survives a restart and is one index for every replica; the collators refresh it on their schedule as before. Until now the index was in memory, so after every restart a replica answered `MissingIndexError` until its first collator run, and two replicas each held an index of their own. On sqlite (the dev server, the lab) the in-memory engine stays.
