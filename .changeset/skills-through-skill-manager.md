---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

Skills and plugins are listed and read through the installation's skill-manager, as the signed-in person.

- agent-platform: where the installation's muster lists skill-manager, the skills step, the agent pages and the skill pages read `x_skill-manager_list_skills`, `get_skill` and `get_skill_file` instead of gs-backend's `/agent-skills` routes. The wizard and the agent pages read the installation the agent runs on; the other pages read the portal's home installation. A private repository the person's GitHub login cannot read lists no skills or plugins, and the skills step shows skill-manager's reason (for example, to connect GitHub in muster). Before, every signed-in person saw its skills and was refused only when creating the agent. Add skill offers skill-manager's writable sources that scan the whole repository and that the person can read, instead of `agentPlatform.skills.repositories`.
- gs-backend: `POST /agent-skills/pull-request` takes `installation`. With it, the target must be a writable source of that installation's skill-manager, read as the person through muster (`backstage-muster-authorization`); a read-only source is refused with 403, and the pull request targets the source's `ref` when it names one. Without it, the configured `agentPlatform.skills.repositories` apply as before.
- muster: `MusterApi.authHeaders(installation)` gives the headers that carry the person's muster token, for a backend plugin that calls muster as them.
- Where skill-manager is not deployed, gs-backend's discovery of `agentPlatform.skills.repositories` answers as before. That path is deprecated. Where muster's server list cannot be read, the skills step says so instead of answering from that list.
