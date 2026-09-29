---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Muster's server and workflow dialogs (confirm, edit as JSON/YAML, manifest) use
bui instead of MUI. Confirm buttons are red only for deletes: saving an edit,
activating, deactivating or reconnecting a server, stopping a served model and
cancelling a download no longer get the destructive treatment.
