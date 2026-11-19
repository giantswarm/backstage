---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-ui-react': patch
---

Where `gs.features.platformSection.enabled` is set, a Platform cluster's page has an SSH access tab (`/platform/clusters/<installation>/<namespace>/<name>/ssh-access`) for Giant Swarm staff, after Node pools: the classic cluster page's SSH access tab in the shell's style, with the Teleport commands for the control plane nodes, the worker nodes and a specific node, each with a copy button, and a link to the cluster's nodes in Teleport. A person known not to be staff has no such tab, and its address opens Overview. A person whose installation token has no `groups` claim counts as not staff instead of breaking the cluster page. `CodeBlock` text is 12px at least (`max(0.85em, 12px)`), where it was 11.9px under 14px text. In fixture mode the guest is Giant Swarm staff.
