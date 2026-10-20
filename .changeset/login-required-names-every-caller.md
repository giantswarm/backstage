---
'@giantswarm/backstage-plugin-gs': patch
---

The Login Required dialog's `data-login-requested-by` names every caller that may open it: the Kubernetes token, the stored settings, the GitHub grant, the Installations version columns and the plugins that forward the main login's ID token, beside the portal fetch and the cluster-token mint.
