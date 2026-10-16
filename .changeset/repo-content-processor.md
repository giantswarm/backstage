---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

New `RepoContentProcessor`: writes `giantswarm.io/default-branch`,
`backstage.io/techdocs-ref` (when the default branch has a root `README.md`, in
any case) and the
`defaultbranch:master` tag on components with `github.com/project-slug`. Off by
default (`catalog.processors.repoContent.enabled`); needs a GitHub token. A
`techdocs-ref` set by hand (anything but `url:https://github.com/<slug>/tree/...`)
is left alone.

A scheduled task (`catalog-module-gs:repo-content-refresh`, hourly by default,
`catalog.processors.repoContent.schedule`) reads every named repository over
GitHub GraphQL, 25 repositories per query, and stores the result in the
`repo_content` table. The processor reads that table into memory once a
minute, so the values survive restarts and failed lookups, and only components
whose record changed are refreshed. A repository GitHub reports as gone or out
of reach loses its record; a record not fetched again for seven days is
dropped. GitHub rate limits are logged at `info`.

`BuildStatusProcessor` stops writing `giantswarm.io/default-branch` when
`catalog.processors.repoContent.enabled` is true.

The module's migrations run once at startup however many features use the
database, and the SBOM refresh task skips a `github.com/project-slug` that
names more than `owner/repo`.
