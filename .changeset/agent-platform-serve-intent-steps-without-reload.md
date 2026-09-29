---
'@giantswarm/backstage-plugin-agent-platform': patch
---

GPU node pool serve intent: the served model's steps appear beneath **Serving <preset>** with the read that follows `load_model`, and keep moving while the tab is not focused — no reload needed. Once `load_model` was asked, the portal re-reads the installation's model-manager backends and inventory at once (the inventory read is gated on the backends list, which predated the pool's registration of its backend), and model-manager's reads — backends, inventory, node view — poll in a background tab like the pools read does, so a served model's timeline on the pool panel and the Serving view moves whichever tab is in front.
