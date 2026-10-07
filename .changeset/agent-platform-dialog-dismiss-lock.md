---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A dialog holds itself open only while a write is on its way. The Load, Pull and Import model dialogs can no longer be closed by their header's close button mid-request; the Add GPU node pool dialog no longer lets go of a Deploy or Commit when its review reruns; and the Create cluster, Delete cluster, Add model backend and Remove model backend dialogs can be left while their dry run is still out, since it writes nothing.
