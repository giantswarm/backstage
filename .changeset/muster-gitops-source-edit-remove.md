---
'@giantswarm/backstage-plugin-muster': minor
---

MCP servers page: the "Managed through GitOps" label on a server links to its source in Git, like the cluster and deployment pages do. The two buttons "Edit via GitOps" and "Remove via GitOps" become one **Edit/Remove** button. Its dialog links to the source and lists the steps to take there. For a server applied by a Kustomization: find the MCPServer file, edit its `spec` or delete it and its `kustomization.yaml` entry, then open a pull request. For a server rendered by a HelmRelease: change the release's values instead. The steps say "merge request" for a GitLab source and "pull request" otherwise. When the source can't be resolved, the dialog names the managing HelmRelease or Kustomization by its real kind. The current manifest is shown in the read-only YAML editor.
