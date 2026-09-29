---
'@giantswarm/backstage-plugin-agent-platform': patch
---

**Try it** on a served model sends the model id the ModelConfig sends — `spec.model`, the name vLLM serves the model under (the Hugging Face repository) — instead of the serving object's name, which vLLM answered with 404 "The model `<name>` does not exist". The served model's ModelConfig now carries that id from model-manager's inventory.
