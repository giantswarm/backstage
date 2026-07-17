---
'@giantswarm/backstage-plugin-flux-react': patch
---

Fix the Flux resources tree crashing with "TreeWalker must yield at least one root node" when the tree is empty. Two causes fixed: a self-managed Kustomization (one that lists itself in its own inventory, the Flux bootstrap pattern) no longer disqualifies itself as a tree root — previously this could collapse the whole tree to zero roots; and an empty tree (also reachable via the "Failing only" filter on a healthy cluster) now renders an empty state instead of crashing. Inventory references are now matched by namespace and name instead of name only, and a self-managed Kustomization no longer appears as its own child.
