---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Skills can be edited through the same pull-request flow that adds them. A skill's page gains **Edit**, which opens the add-skill form at `/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`. The form is prefilled with the skill's current SKILL.md, read at the commit the catalog pinned it to. The repository and name are fixed, and submitting waits for an actual change. It opens a pull request that rewrites `<dir>/SKILL.md` on `update-skill/<name>`, authored as the signed-in person. The success screen matches adding a skill: the opened pull request, its link, and that a teammate approves it.

gs-backend: the new `GET /agent-skills/content` returns a skill's frontmatter `name`/`description` and its body at a commit, for configured `agentPlatform.skills.repositories` only. github.com repositories are read through the contents API. Any other git repository is read from the depth-1 clone that discovery makes, and answers 409 when its branch moved on from that commit. `POST /agent-skills/pull-request` accepts `kind: 'update'` with the skill's `path` (and optionally `baseCommit`). An update writes the existing file with its blob sha and keeps the frontmatter keys the form does not show. It refuses with 404 when the file is gone, 422 when the edit changes nothing, and 409 only when the branch already exists.

The portal event `AgentPlatform.skillProposed` gains the attribute `kind` (`created`, `updated`).
