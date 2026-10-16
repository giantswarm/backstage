---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

A long user message on the session page is cut to 10 lines, with _Show more_ under the bubble and _Show less_ once open — a continued session's opener, which carries the whole earlier conversation, or a pasted log no longer fills the page. `ui-react` exports the pieces behind `CollapsibleMarkdown` (`useCollapsible`, `CollapsibleViewport`, `CollapsibleToggle`) for a toggle that sits outside the box its content is cut in.
