---
'@giantswarm/backstage-plugin-agent-platform': major
'@giantswarm/backstage-plugin-kubernetes-react': major
---

The Agent Platform section reads kagent **API v2** (`kagent.dev/v1alpha3`), single
version. An installation on kagent 0.10 has no `agenttemplates` resource and is shown
as having no API v2 agents; nothing reads `v1alpha2` any more.

**kubernetes-react.** `Agent` is now the `AgentTemplate` wrapper (`agenttemplates`):
display name and icon from the `ui.giantswarm.io/*` annotations, `spec.systemPrompt`
(or its ConfigMap source), `spec.modelConfig.name`, tool bindings (`getMcpBindings`,
`getAgentRefs`), skills flattened with their pin (`getSkills`: git commit, OCI digest
or object version), the admission label (`HARNESS_LABEL`,
`agent-platform.giantswarm.io/harness`) and readiness derived from
`status.harnesses[]` — per Harness `ready` / `progressing` / `failed` / `pending`
(`deriveHarnessReadiness`), the agent's verdict from the platform Harness the label
names (`decidingHarnessStatus`), and a new **`notAdmitted`** readiness with its
reason for a template no Harness admits. `getType`, `getSkillRefs`,
`getMcpServerRefs`, `getUnsupportedFeaturesWarning` and the `AgentTool` /
`AgentMcpServerRef` types are gone; `getHarnesses`, `getDecidingHarness`,
`getHarnessWarnings` and the `AgentHarness*` / `AgentMcpBinding` / `AgentSkill` types
replace them. New `RemoteMCPServer` class (`getHeadersFrom`, `getHeaderValue` — a
literal value only, never one sourced from a Secret). `ModelConfig` moves to
`v1alpha3` and reads both `Accepted` and `ResolvedRefs`; `getAcceptedCondition` is
replaced by `getReadinessMessage`. `@giantswarm/k8s-types` is bumped to the release
that carries `crds.kagent.v1alpha3`.

**agent-platform.** A roster row is the template joined with the `RemoteMCPServer`
its gateway binding names — the per-agent carrier the Generic chart renders under the
agent's own name — so the new **Toolset** column and the Toolset card read the
`X-Muster-Toolset` header off that server (`toolsetOfAgent(agent, gatewayName,
carriers)`, `useAgentToolset`): declared, implicit full access, no gateway, or **not
readable** while the carrier could not be read. The status column and the Status card
show the admitting Harness and its verdict; the Status card lists every admitting
Harness with the revision it is on and its compile warnings; the Configuration card
shows the Harness label and the bindings (`tools` allowlist, `requireApproval`); the
Skills card shows each skill's repository, path and short commit or digest. Provenance
("Deployed by", the GitOps card, delete) keeps working off the template's Flux labels.
ModelConfigs created, edited and auto-wired from the Models tab are
`kagent.dev/v1alpha3`. The persisted react-query cache is versioned
(`AGENT_PLATFORM_CACHE_BUSTER`): a browser holding a previous release's blob starts
empty instead of rehydrating rows written against another API.

Requires an installation on the kagent API v2 line; ships as the `1.x` line of this
repository.
