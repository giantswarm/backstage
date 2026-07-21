---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-gs': minor
---

Migrate the Plans page to the bui design system and share markdown rendering.

- `ui-react`: add a shared `GSMarkdownContent` component wrapping
  `@backstage/core-components`' `MarkdownContent` with a GFM default and
  consistent typography — matched `<p>`/`<li>` line-height, spacing between
  list items, and padded non-highlighted code blocks (language-tagged blocks
  keep their `CodeSnippet` styling).
- `plans`: move the Proposed/Merged tabs to bui `Tabs`, relocate the repository
  picker to a bui `Select` in the plugin header (via the shared page-header
  actions slot), and rebuild the proposed/merged/review lists on bui
  `List`/`ListRow`. The Merged tab now renders each plan document in a bui
  `Accordion` (expanded by default), hides dot files/folders and loose
  repository-root documents, strips the redundant folder prefix from document
  titles, and shows friendly labels for well-known files (e.g. `PRD.md` →
  "Product Requirements Document"). Comments, chips (→ `Badge`), alerts and the
  Rendered/Diff toggle move to bui equivalents, and plan/comment markdown now
  renders through `GSMarkdownContent`.
- `gs`: render the app/chart component README and SOUL cards
  (`CollapsibleMarkdownCard`) through the shared `GSMarkdownContent`.
