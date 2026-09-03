---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Serve dialog's body scrolls again and its Cancel / Serve model buttons stay
inside the dialog on smaller viewports: the `<form>` that wraps the dialog's
header, body and footer now passes the dialog's flex layout on instead of
growing to its content height and pushing the footer off the screen. The
session rename dialog gets the same layout.
