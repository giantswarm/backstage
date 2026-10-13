---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

New `StatusWithHint` in ui-react: a list row's state as a `StatusDot` with
a few words, and the explanation in an `InfoHint` beside them (a tooltip on
hover, a popover on a press or tap in the shell). Customize → Models and
Customize → Connectors both render their status through it, so the two
lists' hints look and behave the same.
