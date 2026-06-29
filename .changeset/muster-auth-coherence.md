---
'@giantswarm/backstage-plugin-muster': patch
---

Make the muster manager's auth state coherent across every surface: gate create/add affordances on a muster session and stop conflating "auth required" with "down".

- "Add ad-hoc server" (MCP servers) and "Create workflow" (workflows) are now disabled with an explanatory tooltip when there is no authenticated muster session for the selected installation, instead of opening a dialog that fails after the user composes a definition.
- Auth-failure (HTTP 401 / "authentication failure") errors from the ad-hoc validate/save/delete flows are mapped to a friendly "connect to muster (sign in)" prompt rather than the raw `MCP HTTP Transport Error … (HTTP 401)` transport message.
- An `Auth Required` server with no tools now reads "requires an authenticated muster session for your user" rather than "the server may be down", matching the dashboard's treatment of `Auth Required` as a session state, not a degraded one.

The MCP-servers-page session probe is extracted to a shared `useMusterSession` hook so the dashboard, the manager and the workflows list resolve session state (and the connect action) the same way — the dashboard's connect now signs in for the selected installation rather than the default one, and its probe is deduped with the hook's.
