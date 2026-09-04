---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-plans-backend': patch
---

Treat muster's `user not authenticated to server <name>` as "not connected".
Once any session has connected an OAuth server, muster knows its tools, and a
call from a session without a grant fails with that message instead of
`tool not found`. The plans and roadmap gateways now run `core_auth_login` for
it too, which connects a person who consented before (their subject grant)
without a prompt and otherwise yields the sign-in URL -- so the second session
of a person, or the next person, sees "Connect GitHub" instead of a 500.
