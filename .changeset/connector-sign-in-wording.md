---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'app': patch
---

Sign-in prompts say "connector" and name each connector by its display name.

- muster-backend: `GET /servers/names` answers each connector's name (muster's
  key, `<namespace>/<name>` for a tenant's server), family and display name
  from `core_mcpserver_list` (muster v5.53.1 or later for the display name),
  read as the person, so the names are there for people without Kubernetes
  access to the `MCPServer` objects. A failed list answers
  `{ servers: [], unavailable: true }` with HTTP 200; a token muster refuses
  answers 401.
- muster: `MusterApi.listConnectorNames` and the hooks `useConnectorLabels` and
  `useConnectorLabel`, one shared read per installation, replace the
  `MCPServer` read behind the sign-in dialog and the notification inbox, which
  showed technical names to people without cluster access. `ServerSignIn`
  names the connector by it when the caller passes no `displayName`, and shows
  the display name with `showName`, with the server's own name beside it where
  they differ. `isMusterSignInRequiredText` tells muster's request for a
  sign-in from other not-connected answers. The sign-in dialog says
  "connector".
- agent-platform: muster's request for the person's sign-in to agent-manager
  is a sign-in, not agent-manager's own `auth_required` refusal: starting a
  session without it offers the sign-in instead of "Session not started" with
  muster's text. The connect alert names the connector by its display name
  and, for muster's request for a sign-in, writes its own sentence instead of
  muster's; any other not-connected answer stays in sight.
- bot-prs: the marge sign-in alert does the same.
- app: the inbox's sign-in row says "connector".
