---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add model management to the Agent Platform section: a **Models** tab that
lists the kagent `ModelConfig`s agents can run on across the fleet, and lets a
platform admin create, edit and delete them from the portal — parity with
kagent's own UI. Until now the create flow could only _pick_ from models an
admin had hand-applied with kubectl (or provisioned via agentlab's
`platform.extraModels`); the picker's empty state now links to the new flow
instead of dead-ending.

**The form speaks four providers** — OpenAI (covering every OpenAI-compatible
endpoint: vLLM, llama.cpp, OpenRouter, …), Anthropic, Gemini and Ollama — with
a per-provider endpoint (`openAI.baseUrl` / `anthropic.baseUrl` /
`ollama.host`) and `tls.disableVerify` for self-signed lab endpoints. CRs
using the CRD's other providers (AzureOpenAI, Bedrock, VertexAI variants,
SAPAICore) render read-only rather than being mangled by a form that has no
fields for them. The list's status column is the controller's `Accepted`
condition, with its message — typically which Secret is missing — as the
tooltip.

**Key Secrets follow the agentlab contract** (giantswarm/agentlab#44), so
models provisioned by either tool look identical on the cluster: Secret
`kagent-<name>` next to the ModelConfig, whose single key is the provider's
canonical env-var name (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`)
— not configurable, because the kagent controller injects it as an env var of
that name and the ADK runtime looks up exactly those. A keyless endpoint still
gets a placeholder-valued Secret (an agent pod without the env var crashloops
even against an endpoint that never checks the value); Ollama alone gets none.

**The API key is write-only.** The portal never reads Secret values back: on
edit, an empty key field means "leave the Secret alone", and a new value
replaces the Secret's contents in one merge patch (`data: null` +
`stringData`), so a provider switch cannot leave the old canonical key behind
— which is also why switching provider demands re-entering the key. The portal
only writes Secrets named by its own convention; a CR referencing a
hand-provisioned (possibly shared) Secret keeps that reference untouched, and
such a Secret never rides along on delete.

**Writes bypass the scaffolder on purpose.** Agent creation drives `kube:apply`
through a scaffolder template, but a scaffolder task persists its `values` and
echoes the applied manifest into the task output — routing a Secret through it
would store the API key in plain text. Model writes instead go straight
through the Kubernetes proxy with the caller's own OIDC token, which also
surfaces apiserver errors inline (a taken name is a `ConflictError` on the
form, not a failed task page). `SelfSubjectAccessReview` gates decide only
what is shown; authorization stays the apiserver's.

**Ownership and reference guards.** Edit/delete are withheld for tool-owned
CRs — rendered by Helm (the chart's default model), applied by a Flux
Kustomization, or `managed-by`-labeled by anything but the portal (agentlab
re-asserts its models on every run) — each explained in place rather than
silently absent. A marker-less, hand-applied CR _is_ editable: adopting those
into portal management is the point, and portal-created ones are stamped
`app.kubernetes.io/managed-by: giantswarm-backstage`. Deletion lists the
namespace's `Agent`s fresh at mutation time and refuses while any still
references the model; unlike the shared-chart-source check in agent deletion,
a failed read refuses rather than proceeds, because here proceeding is the
unsafe direction.

**New in `kubernetes-react`: `createResource`** — the missing third mutating
verb next to `patchResource`/`deleteResource`, same proxy, same error naming,
plus `ConflictError` for a 409 across all three. The `ModelConfig` class gains
the spec accessors (`getApiKeySecret`, provider blocks, `getTls`,
`getEndpoint`) and an `Accepted`-condition readiness derivation
(`deriveModelConfigReadiness`), mirroring the `Agent` readiness helpers.
