---
'@giantswarm/backstage-plugin-repositories-backend': minor
---

Add the repositories backend plugin: a gateway over giantswarm-repo-manager's
read tools (`list_repositories`, `get_repository`, `refresh_repository`,
`get_info`) for the Repositories page, reached through muster as the
signed-in person (`repositories.muster`). The filters are the tool's own
arguments, type-checked and handed on; a session without a grant gets a 401
carrying muster's sign-in URL. Without `repositories.muster` every route
answers 503.
