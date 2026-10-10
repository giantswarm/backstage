---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Editing an agent opens the new-agent wizard, prefilled from the agent, instead
of the old edit form: the same Details, Skills, Tools and Review steps at
`/agent-platform/agents/edit/<installation>/<namespace>/<name>`, More options
showing the agent's own model (only its namespace's are offered), its fixed
technical name and runtime, the skills step selecting its skills at their pins
(and listing skills from elsewhere, removable), and a review that lists what
changes, dry-runs exactly that and saves it with "Save changes" (or proposes it
as a pull request for an agent applied from git). The former `…/<name>/edit`
address redirects to the wizard. Saved edits and skill updates are reported as
the `AgentPlatform.agentUpdated` event.
