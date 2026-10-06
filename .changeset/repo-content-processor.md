---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

New `RepoContentProcessor`: writes `giantswarm.io/default-branch`,
`backstage.io/techdocs-ref` (when the default branch has a `README.md`) and the
`defaultbranch:master` tag on components with `github.com/project-slug`. Off by
default (`catalog.processors.repoContent.enabled`); needs a GitHub token.

A scheduled task (`catalog-module-gs:repo-content-refresh`, hourly by default,
`catalog.processors.repoContent.schedule`) reads every named repository over
GitHub GraphQL, 25 repositories per query, and stores the result in the
`repo_content` table. The processor only reads that table, so the values
survive restarts and failed lookups, and only components whose record changed
are refreshed. A repository GitHub reports as gone or out of reach loses its
record; one that could not be asked keeps it until the next run.

`BuildStatusProcessor` no longer writes `giantswarm.io/default-branch`. It
only did so when CI reported to the branch.
