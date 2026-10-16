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

Every navigation sends one `pageview` signal with the page's name (`page`, for
example `Session detail`), for some pages the tab or step shown (`view`, and
`subview` on the Connectors tab), and as `path` the template of the route the
page matched, not the address in the browser:

| Address in the browser                              | `path` sent                                              |
| --------------------------------------------------- | -------------------------------------------------------- |
| `/sessions/acme-prod/0c4b2f5e?prompt=hello#t-3`     | `/sessions/:installation/:sessionId`                     |
| `/customize/agents/acme-prod/team-a/helper/usage`   | `/customize/agents/:installation/:namespace/:name/usage` |
| `/catalog/acme/component/payments-api/docs/runbook` | `/catalog/:namespace/:kind/:name/docs/*`                 |
| `/agent-platform/agents/acme-prod/team-a/helper`    | `/agent-platform/*`                                      |
| a path no page matches                              | `unknown`                                                |

The address names installations, namespaces, agents, models, connectors, tools,
workflows, skill repositories, clusters and catalog entities, and carries
session ids; the query string and the hash can carry search terms and typed
text. None of that may leave the portal, so a page view carries only fixed
strings and values from closed sets:

- Each segment that names something is a placeholder (`:installation`), and a
  splat whose depth varies, such as a skill's repository and directory, is `*`.
- A tab or view is named only when it is one the page has; any other segment in
  its place is `*` in `path` and `redirect` or `other` in its attribute.
- Catalog entity, cluster and deployment pages add their `tab`, and catalog
  entity, docs and deployment pages the kind (`entityKind`, `deploymentKind`); an
  unknown tab or kind is `other`. They carry no installation, namespace or name.
- The query string and the hash are never read.

Dashboards built on `page` and `view` are unaffected by this rule; ones built on
`path` see the templates since the portal release that introduced it, raw paths
before.

The mapping is `getTelemetryPageViewPayload` in
`packages/app/src/utils/telemetry.ts`, one case per page, each naming the page
and its route template. A route registered in the app that no case matches
reports as `Unknown page` and is sent to Sentry as an `Untracked page view`
warning, so a new page needs its case and a row in the test's
`knownTopLevelPaths`.

The TelemetryDeck SDK adds nothing of the page to a signal (no URL, title or
referrer), and the browser sends no `Referer` with it: the portal is served with
Backstage's default `Referrer-Policy: no-referrer`.

## Actions

A completed write that matters for the product sends one signal named after the
action. Attributes take only the values listed, each a fixed, coarse value such
as a kind or a mode. No name or identifier of an agent, model, connector, tool,
workflow, workspace, session, cluster or installation reaches a signal, and
neither does a prompt, a message, an answer, anything else a person typed, a
URL or a search term: they can reveal what a customer runs. A failed attempt
sends nothing.

<!-- portal-events:start -->

| Event                                           | When                                                                                                                                                                                                                                                                            | Attributes and their only possible values                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentPlatform.agentCreated`                    | An agent was created in the Agent Platform, deployed live or committed to Git as a pull request.                                                                                                                                                                                | `mode`: `deploy`, `commit`                                                                                                                                                               |
| `AgentPlatform.agentUpdated`                    | An agent's configuration was changed in the Agent Platform — edited, or its skills moved to their latest commits — applied live or committed to Git as a pull request.                                                                                                          | `mode`: `apply`, `commit`; `change`: `edited`, `skillsRefreshed`                                                                                                                         |
| `AgentPlatform.agentDeleted`                    | An agent was deleted in the Agent Platform, live or committed to Git as a pull request; a live delete that found nothing left to remove is not counted.                                                                                                                         | `mode`: `apply`, `commit`                                                                                                                                                                |
| `AgentPlatform.sessionStarted`                  | A session with an agent was started.                                                                                                                                                                                                                                            | `entryPoint`: `sessionsList`, `agentDetail`, `sessionDetail`, `home`, `skillDetail`, `createAgentAssist`, `searchPalette`, `skillCreationAssist`, `workflowEdit`, `workflowCreateAssist` |
| `AgentPlatform.messageSent`                     | A message was sent to the agent in a session, a first message included, and the agent took it.                                                                                                                                                                                  |                                                                                                                                                                                          |
| `AgentPlatform.questionAnswered`                | An agent's question in a session was answered, and the agent took the answer.                                                                                                                                                                                                   |                                                                                                                                                                                          |
| `AgentPlatform.turnStopped`                     | A session's running turn was stopped.                                                                                                                                                                                                                                           |                                                                                                                                                                                          |
| `AgentPlatform.sessionRenamed`                  | A session was renamed.                                                                                                                                                                                                                                                          |                                                                                                                                                                                          |
| `AgentPlatform.sessionDeleted`                  | A session was deleted.                                                                                                                                                                                                                                                          |                                                                                                                                                                                          |
| `AgentPlatform.sessionPinChanged`               | A session was pinned to, or unpinned from, the top of the person's session lists.                                                                                                                                                                                               | `change`: `pinned`, `unpinned`                                                                                                                                                           |
| `AgentPlatform.agentFavoriteChanged`            | An agent was added to, or removed from, the person's favorites.                                                                                                                                                                                                                 | `change`: `added`, `removed`                                                                                                                                                             |
| `AgentPlatform.toolActivityChanged`             | The session page's tool activity was shown or hidden, a choice kept for the person's later sessions.                                                                                                                                                                            | `change`: `shown`, `hidden`                                                                                                                                                              |
| `AgentPlatform.sessionNotificationLevelChanged` | A session's notification level was set: default, all activity or muted.                                                                                                                                                                                                         | `level`: `default`, `all`, `muted`                                                                                                                                                       |
| `AgentPlatform.notificationOpened`              | An unread row of the Notification inbox was opened, which marks it read: a session waiting, failed or with a finished turn, the MCP sign-in row's Sign in, or a plain row another portal feature sent.                                                                          | `kind`: `waiting`, `failed`, `turnFinished`, `mcpSignIn`, `plain`                                                                                                                        |
| `AgentPlatform.notificationsMarkedRead`         | Every unread row of the Notification inbox was marked read.                                                                                                                                                                                                                     |                                                                                                                                                                                          |
| `AgentPlatform.skillProposed`                   | A new skill, or a change to an existing one, was proposed to a skill repository, as a pull request opened as the signed-in person.                                                                                                                                              | `kind`: `created`, `updated`                                                                                                                                                             |
| `AgentPlatform.modelCreated`                    | A model an agent can use (a kagent ModelConfig) was created in the Agent Platform, through the model form. The models a model backend's addition registers are not counted.                                                                                                     |                                                                                                                                                                                          |
| `AgentPlatform.modelUpdated`                    | A model's configuration (a kagent ModelConfig) was changed in the Agent Platform, through the model form.                                                                                                                                                                       |                                                                                                                                                                                          |
| `AgentPlatform.modelDeleted`                    | A model (a kagent ModelConfig) was deleted in the Agent Platform, on its page. The models a model backend's removal takes along are not counted.                                                                                                                                |                                                                                                                                                                                          |
| `AgentPlatform.clusterCreated`                  | A workload cluster was created through cluster-manager, applied live or committed to Git.                                                                                                                                                                                       | `mode`: `apply`, `commit`                                                                                                                                                                |
| `AgentPlatform.nodePoolCreated`                 | A GPU node pool was added to a cluster through cluster-manager, applied live or committed to Git.                                                                                                                                                                               | `mode`: `apply`, `commit`                                                                                                                                                                |
| `Scaffolder.taskStarted`                        | A software template was submitted and its task started.                                                                                                                                                                                                                         |                                                                                                                                                                                          |
| `Muster.mcpServerAdded`                         | An MCP server was registered in muster, through the wizard or its registration tool's page.                                                                                                                                                                                     | `authMode`: `none`, `own-account`, `platform-sso`, `sigv4`                                                                                                                               |
| `Muster.mcpServerUpdated`                       | An MCP server's definition was edited in muster: through the wizard opened from its Edit, as JSON on its page, or on its update tool's page.                                                                                                                                    |                                                                                                                                                                                          |
| `Muster.mcpServerConnectionChanged`             | An MCP server was activated, deactivated or reconnected in muster, on its page or on the tool's page.                                                                                                                                                                           | `change`: `activated`, `deactivated`, `reconnected`                                                                                                                                      |
| `Muster.mcpServerDeleted`                       | An MCP server was deleted from muster, on its page or on the delete tool's page.                                                                                                                                                                                                |                                                                                                                                                                                          |
| `Muster.workflowRan`                            | A muster workflow was run from the Agent Platform, on its page or its tool's, and returned a result.                                                                                                                                                                            |                                                                                                                                                                                          |
| `Muster.toolRan`                                | A muster tool was run from its page in the Agent Platform and returned a result. A workflow's run and muster's connector tools report their own events instead; any other tool counts here, including a write another page reports as its own event (an agent's deletion, say). |                                                                                                                                                                                          |

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
