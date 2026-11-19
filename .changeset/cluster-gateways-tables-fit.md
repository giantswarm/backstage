---
'@giantswarm/backstage-plugin-gs': patch
---

The Gateways and Envoy Gateway policies tables on a cluster's Gateways tab fit their width like the HTTPRoutes table: every header and status label (True, Not reported) stays whole, a listener's route count is never cut or wrapped, and listener and ancestor names wrap where the column is too narrow rather than being cut. The listeners and the status get the larger share of the width, so a listener stays on one line at 1280px. Narrower, a policy's kind moves into its description, and where the columns no longer fit both become lists of stacked rows that name the condition shown and list every condition, listener and ancestor. In the condition columns, a failing condition's reason wraps between its words, not inside one.
