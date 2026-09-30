---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Serve dialog: serve a model as **copies on several nodes**. The Node field becomes a **Nodes** checklist. Tick one node for one copy there, several for one copy on each behind the same endpoint, or use "All N nodes that fit". With none ticked, one copy goes on a node that fits. Nodes a copy cannot land on stay listed, disabled, with the reason. Several ticked nodes are judged together by one `check_fit` ("Fits as 2 copies on A and B", or which node refuses and why), and Serve sends `placement: copies` with the `nodes`. The Serving list shows a model served as copies with every node in the Node column, marked "N copies". Needs model-manager with copies on several nodes (giantswarm/model-manager#194); an older one refuses several nodes with its reason.
