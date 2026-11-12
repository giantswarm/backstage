---
'@giantswarm/backstage-plugin-muster': minor
---

`MusterApi.callTool` and `callToolWithProgress` declare URL elicitation only with `urlElicitation: true`, for a call the person started with a click; by default a sign-in the call needs fails it with muster's 401 `server_sign_in_required`, which the page answers with its inline sign-in. An elicited call puts each page to the person once per action, with no answer kept between actions, and a declined, dismissed or unfinished sign-in on a connector's tool fails it with the same 401 for that connector. Both calls send `urlElicitation` explicitly. The tool page's Run declares it.

A grant server or provider App that muster reports waiting for a sign-in with no `auth_tool` and an `error` (a sign-in that cannot pass for this session) shows muster's reason in place of Sign in or Connect: in `ServerSignIn`, `ServerAuthActions`, the connectors list ("Cannot sign in"), `ProviderAppSignIn`, `ConnectorSignInAlert` (titled "Cannot sign in to <connector>") and the connector page's tools gate; `useServerSignIn` reads it as `signInRefusal`.
