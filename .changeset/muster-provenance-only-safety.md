---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Replace the muster mutation guard with a provenance-only safety model. The verb-heuristic `allowMutations` gate (frontend `classifyTool` + backend `/call` 403) is removed: the trust boundary is the downstream MCP server's deployment (e.g. mcp-kubernetes is deployed read-only), not the portal, so the tool explorer now executes whatever tools muster exposes.

- Removed the `mutationGuard` module, the backend mutating-verb list and `/call` gate, and the `muster.installations[].allowMutations` config option (existing keys are ignored, no breakage).
- The only UI restriction is now GitOps provenance: GitOps-managed resources are read-only and produce a PR/manifest; manually-added (ad-hoc) resources allow live CRUD. The ad-hoc badge is relabelled "Manually added".
- Generalised `lib/gitops.ts` (`readProvenance`, `isGitOpsManaged`, `toManifestYaml`, `toMcpServerDefinition`) to work for any muster `KubeObject` (MCPServer and Workflow), so the workflow CRUD path can reuse it.
