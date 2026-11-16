---
'@giantswarm/backstage-plugin-muster': minor
---

Fixture mode serves muster's connector writes: Add connector, editing, removing, turning on and off and reconnecting a connector are kept in memory until the page reloads, and the connector goes through the states a real muster reports (connecting, then connected, failed or waiting for the person's sign-in). Workflows, their runs and usage follow the connectors: a workflow that calls a removed or failing connector's tools is unavailable. The transport probe fails for a host under `.invalid`, and fixture mode's `filter_tools` counts the matches in `total`, as muster does.
