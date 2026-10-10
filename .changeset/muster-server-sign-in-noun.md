---
'@giantswarm/backstage-plugin-muster': minor
---

`ServerSignIn`, `ServerAuthActions` and `useServerSignIn` take a `noun`
(`'server' | 'connector'`, exported as `SignInNoun`) for their own copy: the
SSO diagnosis, the client-registration notes and the sign-out note. It
defaults to `'server'`, the wording classic-portal surfaces such as Bot PRs'
marge sign-in keep; the Connectors tab, the connector wizard, workflows and
the Agent Platform's agent pages pass `'connector'`. `DEACTIVATED_SIGN_IN_GATE`
becomes `deactivatedSignInGate(noun)`.
