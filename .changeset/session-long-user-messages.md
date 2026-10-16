---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

A long user message on the session page, and in the create-agent assist panel, is cut to 10 lines of its text, with _Show more_ under the bubble and _Show less_ once open — a continued session's opener, which carries the whole earlier conversation, or a pasted log no longer fills the page. A message only a line or two longer is shown whole, and find in page or keyboard focus past the cut opens the message. `ui-react` exports the pieces behind `CollapsibleMarkdown` (`useCollapsible`, `CollapsibleViewport`, `CollapsibleToggle`, `collapseSlack`) for a toggle that sits outside the box its content is cut in, and `mockCollapsibleLayout` from `testUtils`; `CollapsibleMarkdown` now also shows whole a document that would hide no more than a fifth of its cut.
