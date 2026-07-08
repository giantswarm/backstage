---
'@giantswarm/backstage-plugin-plans-backend': minor
---

Add the plans backend plugin: a thin REST proxy over the GitHub API for plan
repositories, consumed by the plans frontend plugin.

- Routes for open pull requests, changed files with patches, git trees, and
  base64-decoded file content.
- Read/write routes for PR discussion comments and inline review comments.
  Comments are written with the GitHub App identity and prefixed with the
  Backstage user for attribution.
- Repositories are config-driven via `plans.repositories` (owner/repo slugs);
  only configured repositories are served, and endpoints return 503 when none
  are configured.
- GitHub access uses the deployed GitHub App credentials via the standard
  `integrations.github` config. All routes require a Backstage user.
