---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Model hosting dialogs follow the app's standard form design. Add GPU node pool, Add model backend, Serve model, Import from Hugging Face, Pull a model and the three remove dialogs keep their main button pressable: a blocked press marks the field that is wrong with its message under it and moves the focus there (opening More options where the field is folded away), instead of a disabled button that says nothing. Fields are one column. The knobs whose defaults fit most cases are under **More options**, with a one-line summary of what they are set to: Maximum GPUs and Zones (Add GPU node pool; the model cache switch, a monthly bill, stays in sight), the agent endpoint, the discovery ConfigMap and the credentials Secret (Add model backend), Placement and Nodes (Serve model), and Serving preset and Target node (Import). Footers have Cancel first and the primary button last, and wrap rather than run past a phone's edge.

Fixed: choosing **None** as the serving preset or **Best node** as the target in the Hugging Face import sent the internal placeholder (`__none__`, `__best__`) to model-manager's fit check and download instead of leaving the preset or node out.
