---
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Skill discovery (`GET /agent-skills`) gains a second provider: a repository in `agentPlatform.skills.repositories` that is not on github.com is now read over the plain git protocol — a depth-1 clone via isomorphic-git, every `SKILL.md` frontmatter parsed from the checkout — instead of being refused. That removes the GitHub REST API (and its 60-requests-an-hour anonymous rate limit) from the portal's skill catalog for any self-hosted or lab-local git server (Gitea, `git http-backend`); github.com repositories keep going through the REST API as before. To keep the backend from cloning arbitrary URLs, a non-GitHub repository must be one of the configured `agentPlatform.skills.repositories`; its failures are forwarded with their upstream status (missing ref → 404, refused fetch → the server's status, unreachable host → 502), like the GitHub provider's.
