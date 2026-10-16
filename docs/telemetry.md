# Usage data (telemetry)

The portal reports how it is used to [TelemetryDeck](https://telemetrydeck.com/)
when an installation configures `app.telemetrydeck`, and nothing otherwise. Each
signal carries a salted, hashed user identifier, never the user's name or email,
and the portal's release version.

An installation turns telemetry on with its own `app.telemetrydeck.appID`. The
base config leaves the app ID empty; a portal started with `app.telemetrydeck`
set and an empty app ID sends no usage data and its backend logs one warning at
startup saying so. `app.telemetrydeck: null` turns telemetry off without the
warning.

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

| Event                                           | When                                                                                                                                                                   | Attributes and their only possible values                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentPlatform.agentCreated`                    | An agent was created in the Agent Platform, deployed live or committed to Git as a pull request.                                                                       | `mode`: `deploy`, `commit`                                                                                                                                                               |
| `AgentPlatform.agentUpdated`                    | An agent's configuration was changed in the Agent Platform — edited, or its skills moved to their latest commits — applied live or committed to Git as a pull request. | `mode`: `apply`, `commit`; `change`: `edited`, `skillsRefreshed`                                                                                                                         |
| `AgentPlatform.sessionStarted`                  | A session with an agent was started.                                                                                                                                   | `entryPoint`: `sessionsList`, `agentDetail`, `sessionDetail`, `home`, `skillDetail`, `createAgentAssist`, `searchPalette`, `skillCreationAssist`, `workflowEdit`, `workflowCreateAssist` |
| `AgentPlatform.sessionPinChanged`               | A session was pinned to, or unpinned from, the top of the person's session lists.                                                                                      | `change`: `pinned`, `unpinned`                                                                                                                                                           |
| `AgentPlatform.agentFavoriteChanged`            | An agent was added to, or removed from, the person's favorites.                                                                                                        | `change`: `added`, `removed`                                                                                                                                                             |
| `AgentPlatform.toolActivityChanged`             | The session page's tool activity was shown or hidden, a choice kept for the person's later sessions.                                                                   | `change`: `shown`, `hidden`                                                                                                                                                              |
| `AgentPlatform.sessionNotificationLevelChanged` | A session's notification level was set: default, all activity or muted.                                                                                                | `level`: `default`, `all`, `muted`                                                                                                                                                       |
| `AgentPlatform.notificationOpened`              | An unread row of the Notification inbox was opened, which marks it read: a session waiting, failed or with a finished turn, or the MCP sign-in row's Sign in.          | `kind`: `waiting`, `failed`, `turnFinished`, `mcpSignIn`                                                                                                                                 |
| `AgentPlatform.notificationsMarkedRead`         | Every unread row of the Notification inbox was marked read.                                                                                                            |                                                                                                                                                                                          |
| `AgentPlatform.skillProposed`                   | A new skill, or a change to an existing one, was proposed to a skill repository, as a pull request opened as the signed-in person.                                     | `kind`: `created`, `updated`                                                                                                                                                             |
| `AgentPlatform.clusterCreated`                  | A workload cluster was created through cluster-manager, applied live or committed to Git.                                                                              | `mode`: `apply`, `commit`                                                                                                                                                                |
| `AgentPlatform.nodePoolCreated`                 | A GPU node pool was added to a cluster through cluster-manager, applied live or committed to Git.                                                                      | `mode`: `apply`, `commit`                                                                                                                                                                |
| `Scaffolder.taskStarted`                        | A software template was submitted and its task started.                                                                                                                |                                                                                                                                                                                          |
| `Muster.mcpServerAdded`                         | An MCP server was registered in muster through the wizard.                                                                                                             | `authMode`: `none`, `own-account`, `platform-sso`, `sigv4`                                                                                                                               |
| `Muster.workflowRan`                            | A muster workflow was run from the Agent Platform, on its page or its tool's, and returned a result.                                                                   |                                                                                                                                                                                          |

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
