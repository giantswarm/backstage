---
'app': patch
---

Sign-in window in the Agent Platform's style. A deployment that serves the
Agent Platform (`app.portals.agentPlatform: true`) now greets people with one
centered card on the shell's light tinted background: the shell's logo, "Agent
Platform", and a "Sign in with …" button per sign-in option (the configured
Dex connector first, the fallback connector as a secondary button) with each
option's message beneath. It is light whatever the theme preference and on
any URL, including a deep link to a classic page. A failed sign-in, or an
error the auth backend redirects back with, shows on the card; a blocked
sign-in popup gets its own hint. Sign-in behaves as before: the option used
last is remembered and its session picked up silently, signing out forgets
it. Classic-only deployments keep the existing sign-in page unchanged, also
for people who opted into the Agent Platform in their own browser, and local
guest sign-in is unchanged everywhere.
