---
'@giantswarm/backstage-plugin-github-actions-backend': minor
'app': minor
---

The catalog's GitHub Actions tab (`@backstage-community/plugin-github-actions`)
runs as the signed-in person through muster instead of a GitHub token in the
browser. New backend plugin `github-actions` (`/api/github-actions`): workflow
runs, run and workflow details, jobs, job logs, re-runs, branches and the
default branch, each a call to GitHub's remote MCP server through muster
(`githubActions.muster: { installation, server, toolPrefix? }` for the
`actions` toolset, `githubActions.repos.muster` for the repository reads),
authenticated with the user's main login (Dex) ID token in
`backstage-muster-authorization`. The app replaces the plugin's API with a
client of that backend and puts a "Connect GitHub" step in front of the tab
(`GET /api/github-actions/connection`, 401 `MusterServerNotConnectedError`
with muster's sign-in URL). A portal without `githubActions.muster` keeps the
community client and the Backstage `github` auth provider.
