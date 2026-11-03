---
'@giantswarm/backstage-plugin-muster': minor
---

Make a connector's sign-in reach the person's agents where muster allows it,
and say so where it does not.

- The connector wizard now defaults "Each person signs in with their own
  account" connectors to one sign-in for the portal and every agent
  conversation (`grantScope: subject`). The choice moved out of the Advanced
  section. muster takes `subject` only on a pinned authorization server, so it
  is written only when an issuer is set. Without one, or when `session` is
  picked, the wizard warns: "Agents will ask you to sign in again in every
  conversation." Editing a connector keeps the grant scope it already has.
- The Connectors list and the connector page show "Portal only", with an
  explanation in a hint, for a connector the person signed in to whose sign-in
  serves this muster session only, instead of a plain green "Connected". The
  Connectors list's Connection filter has a matching "Portal only" bucket. The
  scope comes from muster's `auth://status` (`grant_scope`) and falls back to
  the MCPServer spec.
