---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

`ShellPage` takes a `compactHeader`: once everything above the content has
scrolled out of view, a one-row bar with a smaller title, chosen badges and
the header's actions stays at the top of the view. The session detail page
uses it, with the session's name, state, agent, "Show tool activity" (not at
phone width), the pin and the actions menu. `ui-react/testUtils` adds
`mockIntersectionObserver`.
