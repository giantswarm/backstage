---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

MCP Servers tab: a muster on any installation other than the home one is now
reached with **that installation's brokered token** — the token the cluster token
broker mints for it, issued by the installation's own Dex — instead of the
person's main-login token, which only the home installation's muster trusts.
Switching the tab to another installation shows its tool count, Tool explorer
and core families straight away; before, every non-home installation answered
401 and showed a "Connect to muster" button that fetched the same rejected token
again.

- The home installation is the `gs.installations` entry whose
  `oidcTokenProvider` is `gs.authProvider` (the release itself on a standalone
  install). It keeps the main-login token path; so does an installation the
  kubernetes API does not know, and every installation on a portal without
  `gs.authProvider`. `isHomeInstallation()` is exported for callers that need
  the same answer.
- `getInstallationOidcToken` moves to `@giantswarm/backstage-plugin-kubernetes-react`
  so the muster, kagent and model-manager clients mint identically; the
  agent-platform import path re-exports it unchanged.
- `useMusterSession()` now says **why** there is no session: `failure.kind` is
  `session-expired` (the portal session is gone — the single main re-login fixes
  it), `mint-failed` (the broker or exchange failed; the cause is quoted) or
  `muster-rejected` (a token was sent and muster answered with an error; its
  message is quoted). A `pending` flag covers the first probe. The gates on the
  MCP Servers page, the dashboard and the register flow follow the class — "Sign
  in again" for an expired session, "Retry" otherwise, nothing while checking —
  and no longer claim a generic "not authenticated". A failed mint is not
  retried by react-query, so a declined re-login is one popup, not three.
- `muster.installations[].authProvider` still marks an installation as
  requiring a token (`requiresAuth`), but for non-home installations it no
  longer decides which token is sent; the config docs say so.
