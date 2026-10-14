---
'@giantswarm/backstage-plugin-ui-react': patch
---

`StackedBarChart`'s legend (`showLegend`) is now a list under the chart that wraps in the page's flow. Before, recharts' legend had a fixed 28px, so many long series names (eight models on Cost per day) ran over whatever followed the chart at phone width. The plot keeps its `height`.
