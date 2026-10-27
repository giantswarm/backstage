---
'app': minor
---

Usage data can name the deployment a portal belongs to: with
`app.telemetrydeck.deploymentID` set, every TelemetryDeck signal carries it as
`deploymentID`, so a portal that agentlab sets up can be read next to the
agentlab commands that built the lab. `app.telemetrydeck.testMode: true` files
the signals as test data on any host, not only on `localhost`.

A portal whose `app.telemetrydeck` is missing or `null` now sends no usage data
at all, as documented; it used to send signals in test mode under the app ID
and salt `test`.
