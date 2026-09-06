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
that reaches GitHub through muster as the signed-in person. Every request
carries the user's main login (Dex) ID token; muster holds the person's GitHub
grant and runs the GitHub MCP server's tools with it, so documents are read as
that person and PR comments are authored by them on GitHub -- the portal holds
no GitHub credential and no bot identity is involved. Configure the repositories via

## Gating

All extensions are disabled by default so customer portals never expose the
page. Enable it per deployment via app-config (the deployment also needs a
GitHub MCP server in one of its muster installations, see the backend's
`plans.muster` configuration; the signed-in person's own GitHub access decides
what they can read and comment on):

```yaml
app:
  extensions:
    - page:plans
    - api:plans
plans:
  repositories:
    - giantswarm/bumblebee-plans
```
