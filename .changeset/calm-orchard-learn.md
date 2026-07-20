---
'@giantswarm/backstage-plugin-flux-react': patch
---

Fix the Flux resources tree crashing with "TreeWalker must yield at least one root node". Root detection now matches inventory references by namespace and name instead of name only — previously any inventory entry disqualified unrelated Kustomizations sharing its name in other namespaces, which could collapse the tree to zero roots on multi-org clusters. An empty tree (also reachable via the "Failing only" filter on a cluster without failures) now renders an empty state instead of crashing.
