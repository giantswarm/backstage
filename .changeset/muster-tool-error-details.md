---
'@giantswarm/backstage-plugin-muster': patch
---

A tool-level error's further text blocks (muster-backend's `error.details`, from gs-node's `MusterToolError`) stay with the thrown error; `toolErrorDetails(error)` reads them — cluster-manager's `delete_node_pool` answers its structured refusal there.
