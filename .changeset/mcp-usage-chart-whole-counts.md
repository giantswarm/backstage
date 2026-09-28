---
'@giantswarm/backstage-plugin-muster': patch
---

Show whole numbers in the tooltip of the "Tool calls by outcome" chart, as the
tables below it already do. The counts come from Prometheus `increase()`, which
extrapolates and so returns fractions.

Also give the chart a legend, so its three outcomes are not told apart by colour
alone.

Counts in this section now always group thousands with a comma (`5,271`),
whatever the browser's locale, like the other figures on the Usage page, and
the chart's y-axis uses the same notation.
