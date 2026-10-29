---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': patch
---

The connector wizard takes a pre-registered OAuth client's ID and secret in "Each person signs in with their own account" mode; muster stores them in a Secret bound to the connector. An edit shows the client as stored, with Replace, and asks for it again when the issuer or an endpoint changes; "Use an existing Secret" keeps naming a Secret instead. The values go only into muster's create or update call: not into validation, the form's saved state, analytics or errors.

muster-backend answers a refusal of muster's connector writes (`core_mcpserver_create`, `_update`, `_validate`) on `/call` with 422 instead of 500, so it no longer reaches Sentry.
