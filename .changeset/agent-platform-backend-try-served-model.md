---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

`POST /model-manager/models/try`: one short chat completion against a served model's endpoint as model-manager reports it for the installation (read as the person on the same request — never a caller-supplied URL), sent twice — without a token and with the person's — and both outcomes answered, so the Serving page's **Try it** shows the gateway enforce the ModelConfig's passthrough and the model answer.
