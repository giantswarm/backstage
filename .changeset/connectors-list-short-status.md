---
'@giantswarm/backstage-plugin-muster': patch
---

The Customize Connectors list keeps each connector's state to a few words
("Sign-in expired", "Signing in…", "Could not sign in", "Status unavailable"),
so it stays visible in a narrow Status column. The explanation it used to print
beside the state (why an SSO connector has nothing to sign in to, the wait for
the sign-in page, the client registration note, muster's answer to a refused
sign-in) moves into a tooltip on the state; the Sign in button stays, at the
end of the row on a phone. A deactivated connector's Sign in is disabled and
says why.
