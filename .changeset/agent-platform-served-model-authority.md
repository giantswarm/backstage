---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A ModelConfig is linked to the served model it fronts ("Served by Ollama
model …", the Serving view's Used by column, the auto-wiring) by the
`hostname:port` of its endpoint where the backend shares its host with other
servers, not by the hostname alone: a client of another OpenAI-compatible
server on the same machine (a Lemonade server on `:13305` beside Ollama on
`:11434`) is no longer read as served by the one Ollama model that happens to
be there. The model-manager source lists Ollama rows under the backend's
client-facing address (`agentEndpoint`, model-manager 0.8+, else
`endpoint`); KServe predictors keep matching by hostname in every form.
