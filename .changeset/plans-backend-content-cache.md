---
'@giantswarm/backstage-plugin-plans-backend': patch
---

`/content` keeps each person's file reads for 60 seconds per repository, ref and path, so a repeated load of a plan or of the Magazine's History answers without another GitHub read through muster. Concurrent reads share one call, a failed read is not kept, and a ref that moves on is read again once its entry expires. The tree cache and the content cache share one TTL cache helper.
