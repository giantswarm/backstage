---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The Model hosting tables (served models, GPU node pools, model cache and the GPU capacity nodes) keep their headers and values whole: each column has a minimum width, and a card too narrow for every column first leaves out where a pool or cache runs, the control plane's version or a node's Allocatable and Requested, naming them in other cells (the cluster with its organization), before it stacks the rows; a sort on a column it leaves out moves to the name. New in ui-react: `useFittingColumns`.
