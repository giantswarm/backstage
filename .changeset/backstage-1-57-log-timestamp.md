---
'@internal/backend-common': patch
---

Production JSON log lines carry a `timestamp` field, as Backstage's own root logger writes them from 1.57, which also dropped the request log's `date` field.
