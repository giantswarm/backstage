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
  answers 401, and muster unreachable its 5xx. The shape, `ConnectorName`,
  is in gs-common.
- muster: `MusterApi.listConnectorNames` and the hooks `useConnectorLabels` and
  `useConnectorLabel`, one shared read per installation, replace the
  `MCPServer` read behind the sign-in dialog and the notification inbox, which
  showed technical names to people without cluster access. `ServerSignIn`
  names the connector by it when the caller passes no `displayName`, and shows
  the display name with `showName`, with the server's own name beside it where
  they differ, and takes `onSignedIn`, called once per sign-in that lands
  (also from another tab, or a click that finds the server connected
  already), saying whether it was made in this tab (`SignedIn.here`). The
  names are read once per installation and are not read again on a sign-in.
  The sign-in dialog says "connector", its rows too.
- agent-platform: muster's request for the person's sign-in to agent-manager
  is a sign-in, not agent-manager's own `auth_required` refusal: starting a
  session without it offers the sign-in instead of "Session not started" with
  muster's text. Once that sign-in lands the alert goes; where it was made in
  the tab the person pressed Start in, the refused start goes again. Before,
  the alert stayed, and its Sign in then answered "already authenticated".
  The connect alert names the connector by its display name and, for
  muster's request for a sign-in (`signInRequired`, read from muster's 401
  where the error is classified), writes its own sentence instead of
  muster's; any other not-connected answer stays in sight. Once the sign-in
  lands, every alert of the kind clears: on the create and edit reviews, the
  agent's delete, skills and Harness dialogs, the skill's update dialog, the
  GPU node pool, model cache, model backend and cluster pages and dialogs,
  a dry run behind it asks again and a refused write is cleared for the
  person to press again; nothing that deletes or removes goes again by
  itself. The skills and Harness dialogs now show the alert for a write
  refused for want of the sign-in, which they used to swallow.
- bot-prs: the marge sign-in alert does the same.
- app: the inbox's sign-in row says "connector".
