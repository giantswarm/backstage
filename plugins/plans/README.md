# @giantswarm/backstage-plugin-plans

Frontend plugin (`pluginId: plans`) that renders team planning documents from
GitHub plan repositories (e.g. `giantswarm/bumblebee-plans`) inside the dev
portal.

## Features

- **Proposed tab**: open pull requests against the plan repository. Selecting
  a PR renders each changed document from the PR's head branch
  (markdown via `MarkdownContent`, `index.html` explainers in a sandboxed
  iframe), with a per-file toggle to the GitHub patch instead.
- **Merged tab**: plan documents on the default branch, grouped by top-level
  folder.
- A repository picker appears when more than one repository is configured.

## Backend

Data comes from the `plans` backend plugin
(`@giantswarm/backstage-plugin-plans-backend`), a thin authenticated proxy
over the GitHub API. Every request carries the signed-in user's own GitHub
token (from the portal's `github` auth provider, connected on first use), so
documents are read as that person and PR comments are authored by them on
GitHub -- no shared bot identity is involved. Configure the repositories via
`plans.repositories` (see that plugin's `config.d.ts`).

## Gating

All extensions are disabled by default so customer portals never expose the
page. Enable it per deployment via app-config (the deployment also needs the
`github` auth provider configured, whose GitHub App must be installed on the
plan repositories with Pull requests and Issues write access):

```yaml
app:
  extensions:
    - page:plans
    - api:plans
plans:
  repositories:
    - giantswarm/bumblebee-plans
```
