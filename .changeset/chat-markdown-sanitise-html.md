---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ai-chat': patch
---

Raw HTML in chat messages is sanitised to GitHub's allow-list before it renders,
and images, from Markdown or HTML, render as links to their URL. A message that
quotes tool output no longer makes the browser load a URL or run its handlers.
`<details>` blocks still render.
GFM footnotes link to their note and back.

`MermaidDiagram` takes `untrusted`, which drops a diagram's image nodes and
the remote references in its CSS (`url(…)`, `image-set(…)`, `@import`)
instead of loading them; the AI chat renders its diagrams that way.
