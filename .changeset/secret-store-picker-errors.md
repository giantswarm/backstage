---
'@giantswarm/backstage-plugin-gs': patch
---

Secret store picker: say why stores can't be listed (an API version the cluster
doesn't serve, a refused or failed read) instead of `[object Object]`, show the
field's description once stores load, and use the template's `title` and
`description` when it sets them.
