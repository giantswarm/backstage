---
'@giantswarm/backstage-plugin-agent-platform': major
'@giantswarm/backstage-plugin-agent-platform-backend': major
'@giantswarm/backstage-plugin-agent-platform-common': major
'@giantswarm/backstage-plugin-kubernetes-react': major
'@giantswarm/backstage-plugin-gs': minor
---

The Agent Platform section follows the kagent line onto the `api.kagent.dev/v1alpha3`
**Agent** object and the controller's **Session** records.

**kubernetes-react.** `Agent` wraps the `Agent` kind (`agents`, group
`api.kagent.dev`): the template readers (`getDescription`, `getModelConfigName`,
`getSystemMessage`, `getSkills`, `getMcpBindings`, the new `getSubAgentBindings`)
answer for the inline `spec.template`, `getTemplateRef` names a template run by
reference, `getHarnessName` is `spec.harnessRef.name`, and readiness derives from
`status.conditions` (`ready` / `notReady` / `failed` / `pending`; `notAdmitted` is
gone with the admission label). `getHarnesses`, `getDecidingHarness`, `getAgentRefs`,
`getHarnessLabel`, `HARNESS_LABEL`, `deriveHarnessReadiness`, `decidingHarnessStatus`
and the `AgentHarness*` / `HarnessReadiness` types are removed. `Harness` loses
`getAdmittedHarnessLabel` and `getAgentTemplateSelector` (`allowedAgentTemplates` no
longer exists) and gains `getLimits` and `getEgress`. `ModelConfig` and
`RemoteMCPServer` move to the `api.kagent.dev` group. The `api.kagent.dev` shapes are
declared locally (`kagentApi.ts`) until `@giantswarm/k8s-types` publishes them.

**agent-platform-common.** The session wire module reads `SessionService` responses
(`{sessions: […]}`, `{session}`, `RUNTIME_STATE_*`) instead of
`AgentInstanceService`; a session carries `agent` instead of `agentTemplate`.

**agent-platform-backend.** The kagent client speaks `SessionService`; a create names
the Agent and no longer picks a Harness, and an Agent without a ready revision is a
409 naming it. The generated stubs are pinned to `giantswarm/kagent-upstream`
`a8353a0ace648252e4d0886795406c121117839f`.

**agent-platform.** An agent's extra egress origins (`Agent.spec.egress`, kagent-dev/kagent#3019) are typed on
the create form and the edit page, carried as agent-manager's `egress`, and listed on
the agent's Configuration card; `Agent.getEgress()` reads them in kubernetes-react. The
runtime picker offers every Harness of the namespace by name,
the agent pages read the Agent's own status and the Harness it names, and
agent-manager's responses are read in their Agent shape (`status.agent`, `harness`,
`agentDeleted`). Installation inventory detects kagent by the `api.kagent.dev` group;
cached kagent reads are keyed and busted by that group.
