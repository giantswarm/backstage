---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Delete cluster: reopened mid-removal, the dialog tells an object that is
already being removed from a new one. It reads each object a pass would delete
as you, and one whose deletion was requested already shows under "Still being
removed", in what goes with the cluster and in the pass that deletes it again,
and does not bring back **Finish removal**. A release into the gone cluster
that a pass would still suspend keeps offering it.
When a read fails because the Kubernetes proxy cannot reach the installation,
the dialog stops reading until it is closed and works as before.
