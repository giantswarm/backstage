---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Clusters page: **Create cluster** and **Delete** through cluster-manager, as the signed-in person, where an installation's cluster-manager offers `create_cluster` and `delete_cluster`. Both show cluster-manager's dry runs and offer Commit (a pull request, preselected where git owns the organization) and Deploy/Delete, each disabled with cluster-manager's reason where it refuses; Delete sits behind typing the cluster's name, lists what goes with the cluster and offers the second call and the post-merge live step. The node-pool dialogs now show the pull request cluster-manager opened (its `commit` answer).
