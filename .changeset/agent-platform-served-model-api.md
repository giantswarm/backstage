---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Models pages: a served model shows the APIs it answers. With model-manager
1.1.0 or later, a Ready KServe model gets an **API** column with one chip per
interface its server registered (Chat completions, Responses, Messages,
count_tokens, Embeddings; the route on hover), and the runtime version appears
next to the runtime name. On an installation with the platform's LLM endpoint
(model-manager 1.2.0), the row shows the model's public name, and the copy
action yields the endpoint's URL. The step timeline offers one copy-able
request per interface, filled with the URL, the model name and the auth the
endpoint checks.
