---
'@giantswarm/backstage-plugin-roadmap': patch
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

The roadmap board reads its items one status column at a time, all columns
at once, and shows each column as soon as its read lands: a team's board of
well over a thousand items no longer waits about a minute on one sequential
read, and the all-teams board no longer runs into the gateway's two-minute
timeout. A failed column says "not loaded" next to the error, and a read that
waits while the tab is in the background shows its progress bar instead of
"No board items". `/items` takes `empty=<field>` for the items without a value
in that field, and the backend logs how long each board read took.
