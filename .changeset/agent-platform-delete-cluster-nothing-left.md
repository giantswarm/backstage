---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Delete cluster: cluster-manager's `notFound.nothingLeft` answer (0.27.0) reads as the removal complete. After **Finish removal** the dialog shows the cluster removed instead of a refusal. A cluster already gone opens as already removed, without the refusal, **Check again** or **Delete cluster**.
