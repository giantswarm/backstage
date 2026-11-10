---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-roadmap': patch
'@giantswarm/backstage-plugin-repositories': patch
'@giantswarm/backstage-plugin-platform-capabilities': patch
'app': patch
---

Every address a server provides (a connector sign-in, a device-code page, a
GitHub or manager connect, a sign-in an agent asks for) opens only after the
person agrees in one dialog that shows the full address with its domain
highlighted and warns about a punycode domain, plain http and a user name
before the domain.

- ui-react: `externalUrlConsentApiRef` with `ExternalUrlConsentManager`, and
  `ExternalUrlConsentDialogHost`.
- app: registers the consent API and mounts `ExternalUrlConsentDialogHost` at
  the app root. A desktop notification whose link leads out of the portal
  asks before it opens.
- muster: `useServerSignIn` no longer opens a tab on the Sign in click; it asks
  to open the sign-in page once muster answers. `ServerSignInState` gains
  `openSignInPage` and loses `isPreparing`; the hook's options gain
  `displayName` and lose `tabWaitMs`. A device code's page is a button, not a
  link.
- gs: the GitHub auth API asks before it navigates to muster's connect; a
  connect not opened is a `no_grant` error and is not asked again for two
  minutes. Concurrent token requests share one prompt and its answer.
- plans, roadmap, repositories, platform-capabilities: a missing grant offers
  Connect instead of navigating on first sight.
- agent-platform: an agent's sign-in, a provider sign-in, a connector
  sign-in link in a message and the toolchain-manager's App install page are
  buttons that ask first.
