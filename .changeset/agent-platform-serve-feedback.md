---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Serve model and the Serving list say what happened. A preset that serves already shows as "Serving on <node>" and cannot be served again; a Serve ends in a toast naming the node, and model-manager's "already serves" answer is shown as such. A model in its normal start shows Starting instead of a red Not ready (a crash loop stays red), and a stopped model leaves the list without a reload.
