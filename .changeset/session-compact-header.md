---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

`ShellPage` takes `compactHeader`: once everything above the content has
scrolled out of view, the header turns into one compact row at the top of the
view (a smaller title, the badges, the actions), without moving the content.
`ShellPageExpandedOnly` marks what the compact row leaves out. The session
detail page uses it, keeping the session's name, state, agent, "Show tool
activity" (not at phone width), the pin and the actions menu in sight.
Toggling "Show tool activity" keeps the place being read where it is on
screen.
`useScrolledPast` is a new hook (with a `hysteresis` option), and `ui-react/testUtils` adds
`mockIntersectionObserver`.
