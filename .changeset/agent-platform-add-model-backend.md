---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Serving page gains **Add model backend** and **Remove backend**.

model-manager ships with every installation and starts with no backend. A
backend the person already runs — an Ollama, LM Studio or Lemonade host, or a
KServe cluster — is registered from the Serving page (and from its empty
state) through model-manager's `add_backend` tool, called through muster as
the signed-in person: the review shows the backend document model-manager's
dry run renders (the ConfigMap of the runtime-registration contract), then
**Deploy** writes it as the person; **Commit** is offered and shows
model-manager's answer while a pull request is not available yet. Credentials
are a Secret reference, never a token. The registered backend appears as a
Serving group labelled with its source (registered from the portal, or by
cluster-manager); **Remove backend** on the group header lists what
`remove_backend`'s dry run reports — the ConfigMap and the model configs it
unwires — next to the group's served models, and takes a typed confirm.
Refusals (a static backend from the chart's values, a name clash) are shown in
model-manager's words. LM Studio joins the backends the page has a vocabulary
for. A registered backend that serves nothing
yet — a KServe without a pool, an Ollama before its first pull — is listed
under **Backends without models** with its source and Remove backend, so it
never becomes unremovable for lack of a group.
