# Usage data (telemetry)

The portal reports how it is used to [TelemetryDeck](https://telemetrydeck.com/)
when an installation configures `app.telemetrydeck`, and nothing otherwise. Each
signal carries a salted, hashed user identifier, never the user's name or email,
and the portal's release version.

## Page views

Every navigation sends one `pageview` signal with the page's name (for example
`Clusters index`) and its path. The mapping from path to page name is
`getTelemetryPageViewPayload` in `packages/app/src/utils/telemetry.ts`.

## Actions

A completed write that matters for the product sends one signal named after the
action. Attributes take only the values listed: no prompts, names of agents,
servers or clusters, URLs or search terms reach a signal. A failed attempt sends
nothing.

<!-- portal-events:start -->

| Event                           | When                                                                                              | Attributes and their only possible values                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `AgentPlatform.agentCreated`    | An agent was created in the Agent Platform, deployed live or committed to Git as a pull request.  | `mode`: `deploy`, `commit`                                   |
| `AgentPlatform.sessionStarted`  | A session with an agent was started.                                                              | `entryPoint`: `sessionsList`, `agentDetail`, `sessionDetail` |
| `AgentPlatform.clusterCreated`  | A workload cluster was created through cluster-manager, applied live or committed to Git.         | `mode`: `apply`, `commit`                                    |
| `AgentPlatform.nodePoolCreated` | A GPU node pool was added to a cluster through cluster-manager, applied live or committed to Git. | `mode`: `apply`, `commit`                                    |
| `Scaffolder.taskStarted`        | A software template was submitted and its task started.                                           |                                                              |
| `Muster.mcpServerAdded`         | An MCP server was registered in muster through the wizard.                                        | `authMode`: `none`, `own-account`, `platform-sso`, `sigv4`   |

<!-- portal-events:end -->

Backstage's own analytics events (`click`, `create`, `search`, `discover`) are
not forwarded: search events carry the search term, and the others do not say
more than the page views do.

## For developers

The list above is `portalEvents` in
`plugins/analytics-react/src/events.ts`; a test fails when this page and the
list differ. A plugin reports an action through `useTrackedMutation` from
`@giantswarm/backstage-plugin-analytics-react`, which reports the event through
Backstage's analytics API after the write succeeded; ESLint refuses a plain
`useMutation` in `plugins/*/src`. A write that is not a tracked action passes
`event: null` with an `untrackedReason`. A write ESLint cannot see, one run by
hand with a busy flag and an `await`, goes through `useTrackedMutation` too.
The app's TelemetryDeck connector
(`packages/app/src/apis/analytics/TelemetryDeckAnalyticsApi.ts`) forwards only
listed events with valid attributes; an action named like ours but not on the
list, or with an attribute outside its set, is dropped and reported to Sentry as
a warning.
