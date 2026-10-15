---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-react': minor
'@giantswarm/backstage-plugin-muster': patch
---

A portal tab left open past the Dex ID token's lifetime no longer sends muster
an expired token. The portal session now expires with the ID token's own `exp`,
so it is refreshed before the token lapses, or the person is asked to sign in
again when the refresh fails. The muster client never forwards an expired ID
token, and muster's "token has expired … re-authenticate" answer reads "Your
session expired, sign in again." with the Sign in again action instead of the
raw text. `idTokenExpiresAt` and `isIdTokenExpired` are new in gs-react.
