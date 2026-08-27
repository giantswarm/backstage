---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

MCP servers page: move the per-server OAuth "Sign in" out of the
"Authentication / token chain" detail into the bottom action row, rendered
prominent (primary) next to the secondary lifecycle/CRUD buttons, and add a
"Sign out" action (muster's `core_auth_logout`, via a new POST /auth/logout
proxy route) shown while a per-user OAuth server is connected. Signing out
revokes the session's auth for the server, re-gates its tools, and brings the
sign-in affordance back. Standard (federated) servers get the same per-instance
affordances in an action row of their own.
