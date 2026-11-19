---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
---

Where `gs.features.platformSection.enabled` is set, a Platform cluster's page has an SSH access tab (`/platform/clusters/<installation>/<namespace>/<name>/ssh-access`) for Giant Swarm staff, after Node pools: the classic cluster page's SSH access tab in the shell's style, with the Teleport commands for the control plane nodes, the worker nodes and a specific node, each with a copy button, and a link to the cluster's nodes in Teleport. Anyone else has no such tab, and its address opens Overview. In fixture mode the guest is Giant Swarm staff.
