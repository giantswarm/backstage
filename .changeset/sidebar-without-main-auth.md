---
'@giantswarm/backstage-plugin-gs': patch
---

`ClusterAccessStatusSidebarItem` renders on a portal without a main auth provider (`gs.authProvider` unset, for example the guest sign-in of a local start). It resolved the main auth API at render, which threw there and took the host's whole sidebar down; it now resolves it only for "Sign in again" and reports a failure through the error API.
