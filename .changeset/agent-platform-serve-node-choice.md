---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Serve model: choose the node. The dialog gets a Node field: "Any node that fits" (default) and each node with its free memory budget, fed by a fit check per node; a node the preset cannot land on is listed disabled with the reason. A chosen node is sent to model-manager as the hostname pin, and the verdict reads "Fits — will be placed on <node>"; unpinned it reads "Fits on A and B", never one node the request does not pin. A preset served from its model image reads "served from the model image", shows no download on a node that holds the image, and the GPU capacity table marks a node pinned out by the cache claim as a serving target for model-image presets.
