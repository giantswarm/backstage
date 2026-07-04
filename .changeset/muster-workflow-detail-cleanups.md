---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': minor
---

Muster workflow detail page cleanups and a shared chart component.

- Add a theme-aware `StackedBarChart` component (built on recharts) to
  `@giantswarm/backstage-plugin-ui-react`. Colors, axis text, grid, and tooltip
  all read from the active MUI theme so it looks native in light and dark mode;
  recharts stays an implementation detail behind a small `series`-based API.
- The workflow detail "Runs per day" chart now uses the shared `StackedBarChart`
  instead of a hand-rolled CSS bar. It spans at least 30 days, fills days with no
  runs with empty entries, and always ends on today so the right edge reads as
  "now".
- Remove the breadcrumb from the workflow detail header.
- Render the workflow description's Markdown paragraphs with the standard MUI
  `body1` typography (line height, spacing) so they match other paragraphs.
- Remove the "Remove via GitOps" button from the GitOps-managed workflow
  actions, and rename "Edit via GitOps" to a plain "Show manifest" outline
  button (same manifest dialog).
- Remove the redundant collapsible "Definition (YAML)" section from the workflow
  detail page.
- Align the GitOps "Show manifest" dialog with the "Create workflow" modal: an X
  icon in the title bar (no footer Close button), a primary "Copy manifest"
  button, and the manifest rendered read-only in the shared YAML editor with
  syntax highlighting.
- `YamlEditorFormField` (ui-react) now accepts a `readOnly` prop, forwarded to
  the underlying `YamlEditor`.
- The workflow detail "Executions" panels now size to their content and cap at
  the viewport (scrolling internally) instead of always reserving a tall fixed
  height when empty.
