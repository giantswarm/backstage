---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

Make the muster Tool Explorer's "Sign in" button work for auth-required MCP
servers.

The button called muster's _own_ sign-in, i.e. it resolved the Backstage OAuth
token for muster's `authProvider` — a token the user already held (it is what
made `list_tools` succeed), so the click was a guaranteed no-op. The servers
muster lists in `servers_requiring_auth` each need their own downstream OAuth
flow instead.

- `muster-backend`: add `GET /auth/status` (a native `resources/read` of muster's
  `auth://status`) and
  `POST /auth/login` (`core_auth_login`), which normalises muster's free-text
  answer to `{ status, authUrl?, message }`. Muster's refusals (SSO-managed
  server, rate limit, undiscoverable issuer) return HTTP 200 with
  `status: 'error'` rather than a 5xx.
- `muster`: new shared `ServerSignIn` component and `useServerSignIn` hook. "Sign
  in" now asks muster for the server's sign-in URL and offers it as a link;
  completing the flow in the other tab makes muster connect the server for that
  session, which the hook picks up by polling `auth://status` and then reveals the
  previously hidden tools. SSO-managed servers get an explanation instead of a
  dead button, since only an administrator can fix those.
- The same affordance is now available per server on the MCP Servers page, under
  "Authentication / token chain".
