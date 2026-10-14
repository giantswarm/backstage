---
'@giantswarm/backstage-plugin-gs-backend': patch
---

The agent-skills read routes are now bounded:

- `GET /agent-skills` answers only for the configured `agentPlatform.skills.repositories` (400 otherwise), as `/agent-skills/content` and `/agent-skills/content/file` already did. It no longer reads any github.com repository with the portal's token.
- On a cache miss, a read at a commit remembers a 404, 409 or 422 for five minutes, shares concurrent reads of one key, and runs at most two clones and four GitHub reads at once. Up to 32 more reads wait per pool; past that, the route answers 503.
- github.com owner and repository names are restricted to GitHub's name characters, so a percent-encoded `..` and a `?` are rejected.
- A non-commit answer from GitHub is logged at debug instead of being echoed in the 502 message.
- A flood of refs cannot push a repository's default-branch listing out of the discovery cache.
