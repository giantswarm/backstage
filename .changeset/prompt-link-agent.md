---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A new-session link (`/?agent=<installation>/<namespace>/<name>#prompt=…`) selects its agent when the installation in it is one the portal does not know, as when an agent writes the name agent-manager reports, by matching the namespace and name. A linked agent that is unknown or cannot start is said above the composer instead of the default being selected silently. A prompt from a link puts the focus in the prompt field, with the caret after the text.
