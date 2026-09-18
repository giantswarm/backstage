---
'@giantswarm/backstage-plugin-bot-prs': patch
---

`sortRows` and `countTiles` take the clock as an optional parameter, so the
sort by age and the age tiles can be tested at a fixed moment: the test's two
young fixtures tie on whole-day age for one hour every day, and the sort test
failed in that hour.
