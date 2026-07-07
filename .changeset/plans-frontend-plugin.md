---
'@giantswarm/backstage-plugin-plans': minor
---

Add the plans frontend plugin: a `/plans` page for reading team plan documents
from GitHub plan repositories (e.g. bumblebee-plans).

- **Proposed** tab lists open pull requests; selecting one renders its changed
  markdown files from the PR head branch, with a per-file toggle to view the
  GitHub diff instead, and a link out to the PR.
- **Merged** tab browses the plan folders on the default branch and renders
  their markdown. Plan `index.html` files render in a sandboxed iframe.
- The page and API extensions are disabled by default and must be enabled via
  `app.extensions` app-config, so customer portals are unaffected.
