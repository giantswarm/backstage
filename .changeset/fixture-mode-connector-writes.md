---
'@giantswarm/backstage-plugin-muster': minor
---

Fixture mode serves muster's connector writes: Add connector, editing, removing, turning on and off and reconnecting a connector are kept in memory until the page reloads, and the connector goes through the states a real muster reports (connecting, then connected, failed or waiting for the person's sign-in). Fixture mode's `filter_tools` counts the matches in `total`, as muster does.
