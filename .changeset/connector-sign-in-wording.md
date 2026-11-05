---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'app': patch
---

Sign-in prompts say "connector" and name each connector by its display name.

- muster-backend: `GET /servers/names` answers each connector's name, family
  and display name from `core_mcpserver_list`, read as the person, so the names
  are there for people without Kubernetes access to the `MCPServer` objects. A
  failed list answers `{ servers: [], unavailable: true }` with HTTP 200.
- muster: `MusterApi.listConnectorNames` and the hooks `useConnectorLabels` and
  `useConnectorLabel`, one shared read per installation, replace the
  `MCPServer` read behind the sign-in dialog and the notification inbox, which
  showed technical names to people without cluster access. `ServerSignIn`
  names the connector by it when the caller passes no `displayName`, and shows
  the display name with `showName`. The sign-in dialog says "connector".
- agent-platform: muster's request for the person's sign-in to agent-manager
  is a sign-in, not agent-manager's own `auth_required` refusal: starting a
  session without it offers the sign-in instead of "Session not started" with
  muster's text. The connect alert writes its own sentence with the
  connector's display name and no longer shows muster's answer.
- bot-prs: the marge sign-in alert names the connector by its display name.
- app: the inbox's sign-in row says "connector".
