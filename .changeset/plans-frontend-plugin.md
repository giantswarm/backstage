---
'@giantswarm/backstage-plugin-plans': minor
---

Add the plans frontend plugin: a `/plans` page for reading and reviewing team
plan documents from GitHub plan repositories (e.g. bumblebee-plans).

- **Proposed** tab lists open pull requests; selecting one opens a shareable
  full-width review page (`/plans/pr/<number>`) with a document nav and a
  reading column.
- The review page's left nav lists an Overview entry (PR description and
  discussion) and each changed document with its title and comment count; the
  reading column renders one document at a time with readable typography.
- Paragraph-level commenting on rendered documents: hovering a changed block
  shows a comment affordance in the margin, and existing review threads render
  in place under the block they annotate, with replies. Comments are stored as
  regular GitHub review comments anchored to diff lines.
- A per-document toolbar toggles between the rendered view and the GitHub
  diff (with line commenting), and shows diff stats, file status, and a
  GitHub link. Plan `index.html` files render in a sandboxed iframe.
- **Merged** tab browses the plan folders on the default branch and renders
  their markdown. YAML frontmatter is split off and shown as a muted block
  instead of being garbled by the markdown renderer.
- The page and API extensions are disabled by default and must be enabled via
  `app.extensions` app-config, so customer portals are unaffected.
