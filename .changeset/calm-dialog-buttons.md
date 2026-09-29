---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Muster's server and workflow dialogs (confirm, edit as JSON/YAML, manifest) use
bui instead of MUI. Confirm buttons are red only for deletes: saving an edit,
activating, deactivating or reconnecting a server, stopping a served model and
cancelling a download no longer get the destructive treatment.

`ConfirmDialog` can no longer be closed with its header button while busy, and
keeps line breaks in error messages. ui-react exports `useOnDialogOpen`, which
resets a controlled dialog's state when it opens, and `ALERT_MESSAGE_STYLE`.
