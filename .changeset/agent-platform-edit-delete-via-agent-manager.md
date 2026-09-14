---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agents are edited, have their skills updated and are deleted through
agent-manager's tools over muster, as the signed-in person — the portal keeps no
copy of the ownership logic and performs no direct Kubernetes write for agents.

**Delete** calls `x_agent-manager_delete_agent`. agent-manager deletes the owning
HelmRelease (helm-controller uninstalls the `AgentTemplate` and the agent's
`RemoteMCPServer` with it) and the namespace's shared `OCIRepository` only when
nothing else references it; the success toast names who the delete ran as and,
when the chart source stays, agent-manager's reason (`ociRepositoryKept`). A
GitOps-owned or suspended release is agent-manager's refusal, shown verbatim in
the dialog; a viewer's confirm shows the apiserver's Forbidden. The portal never
passes `force`. `useDeleteAgent` (owner resolution, the Kustomization and
suspended guards, the sibling list, the `SelfSubjectAccessReview` gate) is gone.

**Edit** (`Edit agent…` → `/agents/<installation>/<namespace>/<name>/edit`) is
a form pre-filled from `x_agent-manager_get_agent` — display name, description,
system prompt, model (from `list_model_configs`), toolset, skills with their
pins; no runtime. The review is `validate_agent` with `update: true` for exactly
the change Save sends: the changed fields, the values the release would carry,
every violation. Save calls `update_agent` with the changed fields only (an
emptied field as `""`, back to the chart default; `toolset`/`skills` replace
their list), then the detail page polls `get_agent_status` until the platform
Harness compiled the new revision. Adding a skill pins it to the head commit its
card shows.

**Update skills** (Skills card and kebab): the dry run (`validate_agent` with
`update: true` and `refreshSkills`) shows, per git skill, the pinned commit next
to its repository's default-branch head and which entries would move;
digest-pinned skills are listed and left alone. Confirming calls `update_agent`
with `refreshSkills` and nothing else. An unreachable repository is
agent-manager's message and nothing is written.

**Feature detection replaces the access review.** The three actions are offered
when the installation's muster lists `agent-manager` (`core_mcpserver_list`);
otherwise a disabled menu item says why. **Commit** (`mode: commit`,
giantswarm/agent-manager#24) is wired on delete and on the edit review behind
`get_info.capabilities.commit` and stays hidden until agent-manager reports it.

Shared with the create flow: the `AgentManagerClient` seam (`get_agent`,
`list_model_configs`, `validate_agent` as an update, `update_agent`,
`delete_agent` added), the post-write progress element (now for create, save
and skills update), `ConnectAgentManagerAlert` and `CommitOutcome` as shared
components, `SkillPicker` for the skills grid.
