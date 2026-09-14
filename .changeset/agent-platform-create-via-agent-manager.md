---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agent creation goes through agent-manager's tools over muster, as the signed-in
person — and produces a Generic agent chart 1.x release on kagent API v2.

**The portal composes nothing any more.** The review page is agent-manager's dry
run: the form is sent as agent-manager's create contract
(`x_agent-manager_validate_agent`) and the page renders what comes back — the Flux
`HelmRelease` and the shared `OCIRepository` tracking the chart's **`1.x`** range,
the composed values (as the manual `helm install` fallback), and every schema
violation and precondition failure inline, in agent-manager's words. Deploy calls
`x_agent-manager_create_agent` with the same spec; agent-manager applies it with the
person's own credentials, so the release's `managedFields` name the person and the
apiserver's RBAC decides. A viewer's Forbidden, a conflict for an existing name, a
GitOps-owned namespace are shown on the review page as agent-manager reports them.
The portal never passes `force`.

**Skills are pinned at write time.** Skill discovery (gs-backend `/agent-skills`)
now resolves the head commit of the ref and reads the tree and every `SKILL.md` at
that commit, so each skill carries the commit it was read at; the skills step shows
it as the short SHA next to the branch, and the create request carries
`skills[].git.commit` — the commit the person saw, never a branch. There is no
runtime field and no per-skill credential in the request.

**The seam is the muster plugin's own client** (`musterApi.callTool`, tools
`x_agent-manager_<tool>`): the person's token for the installation's muster, no
agent-manager URL, no REST client. A muster session that is not connected to
agent-manager yet gets the muster plugin's sign-in affordance; agent-manager's
refusals are told apart from muster's answers by their code prefix.

**Feature detection from the MCPServer presence.** The installation picker offers
only installations whose muster lists `agent-manager` (`core_mcpserver_list`) and
names the ones that have models but no agent-manager, with the reason; a portal
without the muster plugin says nothing can be created from it. No fallback path.

**After Deploy** the person lands on the agent's detail page, where a progress
alert polls agent-manager's `get_agent_status` until the platform Harness reports the
template ready (the alert names the Harness) or failed, with the reason. **Commit**
(`create_agent` with `mode: commit`, a pull request instead of a live apply) is wired
behind `get_info.capabilities.commit` and stays hidden until agent-manager reports it.

**Removed:** `lib/composeManifests.ts`, `hooks/useDeployAgent.ts`,
`hooks/useAgentChart.ts`, `lib/agentDefaults.ts`, the app-config keys
`agentPlatform.chart.*`, `agentPlatform.fluxServiceAccountName` and
`agentPlatform.deployTemplateRef`, the scaffolder detour (no scaffolder task on the
create path, no OIDC token minted by the portal) and the default-prompt read from
the chart (an empty prompt is sent as absent and the chart's default applies). The
`kube:apply` action stays for the other templates; the hidden `agent-deployment`
template in `giantswarm/backstage-catalogs` is unused after this release.
