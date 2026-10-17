---
'@giantswarm/backstage-plugin-gs': minor
'app': patch
---

While a person's action waits on the main sign-in, `<body>` names the callers
that asked for the Login Required dialog in `data-login-requested-by`:
`portal-fetch` for the portal's own requests, `cluster-token-mint` for a
broker-backed installation's token. The dialog's text is unchanged. New
exports: `asLoginRequestCaller`, `LOGIN_REQUESTED_BY_ATTRIBUTE` and the
`LoginRequestCaller` type.
