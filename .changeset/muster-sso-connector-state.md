---
'@giantswarm/backstage-plugin-muster': patch
---

A connector that comes with the portal sign-in (muster's `kind: sso`, token
forwarding or exchange) is never counted as waiting for a sign-in, since there
is nothing to sign in to: it is out of the MCP sign-in list the Notification
inbox, its unread count, toast and desktop notification and the sign-in dialog
are built from. One that refused that sign-in reads "Cannot connect" in the
Connectors list, and its Tools tab says that an administrator needs to add the
portal sign-in's audience to its trusted audiences, with muster's account of
the attempt under Details. muster's `sso_attempt_failed` counts only while the
connector is not connected in this session, so a failure muster kept from
another session no longer marks a connected connector. `ServerAuthStatus`
carries muster's `kind`.
