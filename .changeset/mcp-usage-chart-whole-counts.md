---
'@giantswarm/backstage-plugin-muster': patch
---

Show whole numbers in the tooltip of the "Tool calls by outcome" chart, as the
tables below it already do. The counts come from Prometheus `increase()`, which
extrapolates and so returns fractions.
