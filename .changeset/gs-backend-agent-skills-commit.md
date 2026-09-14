---
'@giantswarm/backstage-plugin-gs-backend': minor
---

`GET /agent-skills` pins what it lists. The route resolves the ref to its head commit
first (`GET /repos/{owner}/{repo}/commits/{ref}` with the `sha` media type — a branch,
a tag or a commit alike) and reads the git tree and every `SKILL.md` at that commit,
so the listing is one consistent snapshot. Every skill now carries `commit` next to
`ref`, and the response carries the repository-level `ref` and `commit` too — the
immutable reference an agent's chart values pin the skill to.
