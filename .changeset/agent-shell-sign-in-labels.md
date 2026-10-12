---
'app': patch
---

The Agent Platform's sign-in card drops two lines that only repeated what the
card already says: "Sign in to continue." under the title, and the default
message under each button ("Sign in using Dex" under "Sign in with Dex", and
the fallback option's "Sign in through another identity provider"). A message
the deployment configures (`gs.signInProvider.message`,
`gs.signInFallbackProvider.message`) still shows beneath its button. The
classic sign-in page is unchanged and keeps the default messages.
