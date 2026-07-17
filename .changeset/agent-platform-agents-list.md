---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add an agents list to the Agent Platform "Agents" tab
(`/agent-platform/agents`), replacing the stub landing.

- List kagent `Agent` resources across all reachable installations and
  namespaces in a bui table showing display name, description, installation,
  namespace, model, and skill count. The model column resolves each agent's
  `spec.declarative.modelConfig` reference to the referenced ModelConfig's
  friendly name.
- Rows accumulate per installation and stay put as the reachable-installation
  set changes or a background refetch transiently fails, so agents don't flicker
  in and out; results are cached/persisted like the other fleet lists.
- Show a progress bar until the first agents arrive, and report installations
  whose Agents couldn't be read in a warning card below the table (reusing the
  create flow's alert via the new shared `UnreachableInstallationsAlert`).
- `kubernetes-react`: fix `Agent.getSkillRefs()` to read `spec.skills.gitRefs`
  (the real `v1alpha2` field; it previously read a non-existent
  `spec.skills.refs` and always returned `[]`), and add `getDisplayName()`,
  `getSkillCount()`, and `getType()`.
