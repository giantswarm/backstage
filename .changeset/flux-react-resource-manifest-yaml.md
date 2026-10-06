---
'@giantswarm/backstage-plugin-flux-react': minor
---

Flux details panel: every resource card has a **View YAML** button in its footer. It opens the resource's manifest as syntax-highlighted, read-only YAML, sorted like `kubectl get -o yaml` and without `managedFields` or the `last-applied-configuration` annotation, with a button to copy it. The manifest is a snapshot taken on open, so polling doesn't reset the reader's selection, and the dialog stays open when its resource is selected away or disappears. While focus is inside a dialog, Cmd/Ctrl+F and Cmd/Ctrl+G no longer drive the tree search behind it.
