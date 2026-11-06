---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Make the search palette easier to use. Its filter chips hold their places
while results load, and the chips of kinds that turn out empty go in one step
once everything is read. Descriptions, key hints and other small text are at
least 12px. A search ignores spaces, hyphens and underscores, so
`swarmoperator`, `swarm-operator` and `Swarm Operator` all find the Swarm
Operator agent, and a name still matches with one typo; exact and prefix
matches rank first. The palette no longer dims the page behind it, and can be
dragged by its header to keep a running session in view; the browser
remembers where it was put, and a double-click on the header puts it back in
the middle.
