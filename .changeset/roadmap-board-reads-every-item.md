---
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

The roadmap board reads every item of a column instead of the first 50: the
backend asks pro's `list_issues` for every matching item (`limit: 0`), so each
column's count chip and the team activity view count everything in scope. A
read pro still cuts short fails the column with an error instead of showing
part of it, and the read log carries pro's `totalCount` and `hidden` counts.
