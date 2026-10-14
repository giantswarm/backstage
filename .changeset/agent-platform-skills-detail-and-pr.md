---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Skills grow a detail page, an "Add skill" flow, and the meta-agent role helper.

**Skill detail page** (`/agent-platform/skills/<owner>/<repo>[/<skill dir>]`):
every card on Customize → Skills now opens a page built from the discovery
list's data alone (decision G7 — no version history, no SKILL.md body, since no
API serves either): name and description from the frontmatter, source
repository, path, branch and the pinned commit, the agents using the skill
(each linking to its page — which is also where a pin is updated, so the list
is the page's honest "update" affordance; there is no global update), and a
"View source" link into the repository at the pinned commit. An **Evaluate**
button appears only where the `skillEvaluation` meta-agent role resolves
(decision G8); it opens a session with that agent, the review prompt prefilled.

**Meta-agent roles** (decision G13): `agentPlatform.metaAgents`
(`generalInformation`, `agentManagement`, `workflowManagement`,
`platformOperations`, `skillEvaluation`) maps each role to an agent name in
app-config, served through the signed-in config. `readMetaAgents`
(agent-platform-common) reads the mapping; `useMetaAgent(role)`
(agent-platform) resolves it against the agent index and returns the agent or
undefined — features gate on it and hide while unresolved.

**Add skill via pull request** (decision G16 B): the Skills tab's new "Add
skill" dialog (name, description, instructions, target repository) calls
gs-backend's new `POST /agent-skills/pull-request`, which validates the target
against `agentPlatform.skills.repositories`, creates `add-skill/<name>`, puts
`<name>/SKILL.md` and opens the pull request — **as the signed-in person**,
with their own GitHub grant in muster (`githubAuthApiRef`; the token travels in
a `gs-github-token` header, and a person without a grant is bounced through
muster's connect once). Nothing deploys: a teammate approves the PR and the
skill appears once it merges and discovery re-reads the repository. GitHub's
refusals (no push access, the skill or branch already existing, rate limits)
are forwarded with their upstream status and said in words.

New portal event `AgentPlatform.skillProposed`; `AgentPlatform.sessionStarted`
gains the `skillDetail` entry point.
