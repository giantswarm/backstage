---
'@giantswarm/backstage-plugin-muster': patch
---

Make the workflow-list search token-aware and relevance-ranked instead of a naive substring filter.

The previous filter matched the query against any substring of a workflow's name or description, so searching "dex" returned `loki-request-errors` and `memcached-low-hit-ratio` purely because their descriptions mention "in**dex**". Search now matches on word/token boundaries (a query token must be a prefix of a name/description token), requires every query token to match, and orders results by relevance (name matches and exact tokens rank above description-only and prefix matches). "dex" now returns the dex workflows, not "index"-only matches.
