---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

A person who holds the workspace-manager grant no longer sees "Sign in to use
workspaces" in a new portal session. The backend's sign-in hold, kept per
person, answered a new token's calls with "a sign-in to it is pending for you"
without asking muster, although muster connects that token's session with the
person's grant. A new token's held call now first reads its own
`auth://status` once (a read that starts no sign-in) and goes to muster when
the server reads connected. The sign-in card reads again whenever muster reads
the server connected, also when it already did as the card mounted.
