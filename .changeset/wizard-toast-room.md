---
'@giantswarm/backstage-plugin-ui-react': patch
---

A wizard step leaves room at its end for the agent shell's toast, which floats
above the footer: with a notification showing, the step's last control (such as
More options on the New agent wizard's Details) scrolls clear of it instead of
staying under it.
