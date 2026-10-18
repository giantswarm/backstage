# @giantswarm/backstage-plugin-analytics-react

## 0.2.0

### Minor Changes

- 2b79a0c: The ⌘K command palette: a client-side search over what the shell already
  reads — session titles, agents (name and description), skills and
  connectors — grouped by kind with filter chips, capped per group with a
  "+N more" count, and a final row handing the query to the classic
  portal-wide search (`/search`). Opens on ⌘K / Ctrl+K (only inside the agent
  shell and never from inside an input), from the rail's Search item and from
  the mobile bar's. Arrow keys walk the results, Enter opens one, and ⌘↵ on an
  agent starts a new session with it through the usual composer — tracked as
  `AgentPlatform.sessionStarted` with the new `searchPalette` entry point.
  Session content is not searched (platform gap G6): titles and metadata only.
- 2b79a0c: Add the create-agent assist: a side chat with the configured agent-management
  meta agent (the "Swarm Operator") on the create flow's first step.

  - A "Let <agent> help" affordance on `/agent-platform/agents/new`, gated on the
    `agentPlatform.metaAgents.agentManagement` role mapping (decision G13):
    hidden entirely while the role is unconfigured or names no existing agent.
  - The affordance opens a side panel (full-screen at phone width) hosting an
    ordinary kagent session with that agent — `NewSessionComposer` with the
    assistant preselected and a create-agent-context prompt prefilled and
    editable, then the conversation in place: polled timeline, streamed live
    turn, composer, the agent's `ask_user` questions answered in the panel, and
    a link to the full session page.
  - Accept-into-form: each fenced code block of the agent's newest reply gets a
    "Use as system prompt" button that copies it into the form's System prompt
    field, with a one-step Undo. This is deliberately the whole accept mechanism:
    kagent replies are plain markdown with no structured suggestion protocol, so
    the prototype's richer accept-to-apply (skills into the selection, per-field
    patches) stays out until the backend carries structure for it.
  - `analytics-react`: `AgentPlatform.sessionStarted` gains the
    `createAgentAssist` entry point.

- 2b79a0c: Add the `skillCreation` meta-agent role (`agentPlatform.metaAgents.skillCreation`) for the skill creator agent, which writes complex, nested skills in conversation.

  - Add Skill and Edit Skill show a strip above the form where the role resolves to an agent that can take a session: "Use this form for simple skills", the skill creator agent for more complex, nested skills, and **Let <agent> help**. The strip is the one the create-agent flow's "Let Swarm Operator help" uses, now a shared `MetaAgentBanner`. Pressing it starts a session with the agent and opens it. The first message names the target repository and what was typed so far, or the skill being edited (repository, SKILL.md path, commit, branch). It asks the agent to ask about the skill's purpose before writing and to propose the skill as a pull request. Where the role is unconfigured or names no startable agent, nothing shows. The forms themselves stay SKILL.md-only.
  - `agent-platform-common`: `skillCreation` joins `META_AGENT_ROLES`.
  - `analytics-react`: `AgentPlatform.sessionStarted` gains the `skillCreationAssist` entry point.

- 2b79a0c: Skills can be edited through the same pull-request flow that adds them. A skill's page gains **Edit**, which opens the add-skill form at `/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`. The form is prefilled with the skill's current SKILL.md, read at the commit the catalog pinned it to. The repository and name are fixed, and submitting waits for an actual change. It opens a pull request that rewrites `<dir>/SKILL.md` on `update-skill/<name>`, authored as the signed-in person. The success screen matches adding a skill: the opened pull request, its link, and that a teammate approves it.

  gs-backend: the new `GET /agent-skills/content` returns a skill's frontmatter `name`/`description` and its body at a commit, for configured `agentPlatform.skills.repositories` only. github.com repositories are read through the contents API. Any other git repository is read from the depth-1 clone that discovery makes, and answers 409 when its branch moved on from that commit. `POST /agent-skills/pull-request` accepts `kind: 'update'` with the skill's `path` (and optionally `baseCommit`). An update writes the existing file with its blob sha and keeps the frontmatter keys the form does not show. It refuses with 404 when the file is gone, 422 when the edit changes nothing, and 409 only when the branch already exists.

  The portal event `AgentPlatform.skillProposed` gains the attribute `kind` (`created`, `updated`).

- 2b79a0c: Skills grow a detail page, an "Add skill" flow, and the meta-agent role helper.

  **Skill detail page** (`/agent-platform/skills/<owner>/<repo>[/<skill dir>]`):
  every card on Customize → Skills now opens a page built from the discovery
  list's data alone (decision G7 — no version history, no SKILL.md body, since no
  API serves either): name and description from the frontmatter, source
  repository, path, branch and the pinned commit, the agents using the skill
  (each linking to its page — which is also where a pin is updated, so the list
  is the page's honest "update" affordance; there is no global update), and a
  "View source" link into the repository at the pinned commit. An **Evaluate**
  button appears only where the `skillEvaluation` meta-agent role resolves
  (decision G8); it opens a session with that agent, the review prompt prefilled.

  **Meta-agent roles** (decision G13): `agentPlatform.metaAgents`
  (`generalInformation`, `agentManagement`, `workflowManagement`,
  `platformOperations`, `skillEvaluation`) maps each role to an agent name in
  app-config, served through the signed-in config. `readMetaAgents`
  (agent-platform-common) reads the mapping; `useMetaAgent(role)`
  (agent-platform) resolves it against the agent index and returns the agent or
  undefined — features gate on it and hide while unresolved.

  **Add skill via pull request** (decision G16 B): the Skills tab's new "Add
  skill" dialog (name, description, instructions, target repository) calls
  gs-backend's new `POST /agent-skills/pull-request`, which validates the target
  against `agentPlatform.skills.repositories`, creates `add-skill/<name>`, puts
  `<name>/SKILL.md` and opens the pull request — **as the signed-in person**,
  with their own GitHub grant in muster (`githubAuthApiRef`; the token travels in
  a `gs-github-token` header, and a person without a grant is bounced through
  muster's connect once). Nothing deploys: a teammate approves the PR and the
  skill appears once it merges and discovery re-reads the repository. GitHub's
  refusals (no push access, the skill or branch already existing, rate limits)
  are forwarded with their upstream status and said in words.

  New portal event `AgentPlatform.skillProposed`; `AgentPlatform.sessionStarted`
  gains the `skillDetail` entry point.

- 2b79a0c: Hand workflows to the workflow agent (`agentPlatform.metaAgents.workflowManagement`): "Edit via agent" on a workflow's page starts a session about that workflow, and the Workflows overview offers to create one with the agent. Both stay hidden unless the role resolves to an agent that can take a session. Sessions started there report `AgentPlatform.sessionStarted` with the new entry points `workflowEdit` and `workflowCreateAssist`.
- 1e1e0e3: Track creating a cluster (`AgentPlatform.clusterCreated`) and adding a GPU node
  pool (`AgentPlatform.nodePoolCreated`) through cluster-manager, each with its
  `mode` (`apply` or `commit`). The writes that ran outside react-query (the
  cluster-manager and model-manager dialogs, muster's server and workflow
  dialogs) now go through `useTrackedMutation`, so every one of them is tracked
  or opts out explicitly.
- 2b79a0c: `portalEvents` gains `AgentPlatform.agentUpdated` (`mode`: `apply`, `commit`;
  `change`: `edited`, `skillsRefreshed`).
- 9c0ba49: Report meaningful portal actions through Backstage's analytics API: a new
  `analytics-react` library with the typed event list and `useTrackedMutation`.
  Creating an agent (`AgentPlatform.agentCreated`), starting a session
  (`AgentPlatform.sessionStarted`) and registering an MCP server
  (`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
- 9180429: The Agent Platform shell's Notification inbox also lists what other portal
  features send the person through the standard Backstage notifications service:
  plain rows with the title, the description, the age and the link, merged with
  the session rows newest first. They count towards the badge and the tab
  title, "Mark all read" marks them read in the notifications store too, and a
  new one raises a toast and, once switched on, a desktop notification. The
  inbox reads them through the upstream notifications API client and follows the
  backend's `notifications` signals.

  `AgentPlatform.notificationOpened` takes `kind: plain` for such a row.

- 12aaa8b: The Agent Platform shell gets a Notification inbox: a bell with an unread count
  on the rail's Profile row (on a phone, the count on the Profile item and a
  "Notifications" entry first in its menu), opening the sessions that need the
  person: waiting, failed, or with a finished turn at All activity. Clicking a
  row opens the session and marks it read; a row can mute its session, and "Mark
  all read" clears the count. Rows that arrive while the shell is open raise a
  toast, replacing the needs-input toast, and, once switched on in the overlay, a
  desktop notification. The unread count prefixes the tab's title.

  `agent-platform` exports `useNotifiableSessions` (the person's sessions and
  their states, read every 10 s while the tab is visible and every 60 s while it
  is hidden), `AgentAvatar`, `sessionsListSearch` and `PHONE_FULL_SCREEN_DIALOG`,
  and no longer exports `NeedsInputToasts`. `useFleetSessionStates` takes
  `refetchIntervalInBackground` and tells when every installation has answered
  (`isComplete`). `markSeen` and `markManySeen` take an optional reason, which
  reports a row the person opened (`AgentPlatform.notificationOpened`) or "Mark
  all read" (`AgentPlatform.notificationsMarkedRead`), the two new events in
  `analytics-react`.

  `ui-react` adds `useShellDocumentTitleCount`, which prefixes every shell page's
  document title with a count, "(2) Sessions · Agent Platform", and
  `usePageAttention`: whether the page is visible, and whether its window has
  the focus.

- fd05081: Templates mint their cluster tokens when the person selects Create instead of while the form is filled, when they could expire before submit. `GSScaffolderApiClient.scaffold` mints them for every caller, once per installation, for the `GSOIDCToken` fields in the form as submitted (including array items and the selected `oneOf`/`anyOf` option), and routes the task to the installation of the first such field. It now takes `kubernetesApi` and `kubernetesAuthProvidersApi`. A token that fails for any reason other than a sign-in is left out as before. A sign-in that did not complete stops the submit with the new `TemplateSignInError` once every sign-in it asked for has settled. New export `useStartTemplateTask` starts a template's task and reports the new `Scaffolder.taskStarted` event. `ClusterTokenError`, `isSessionExpiredError` and the new `isSignInDeclinedError` are exported from `@giantswarm/backstage-plugin-kubernetes-react`. When Create fails, the template wizard keeps the entries, disables Create while a submit is under way, and shows on the review step an alert that tells an expired session from a declined sign-in.
- 69e07c8: A session's actions menu, on its page and on each row of the Sessions list,
  has a Notifications submenu: Default, All activity or Muted, the current one
  ticked. The level is kept per person in the user-settings backend, with the
  sessions the portal started and what the person has seen in the Notification
  inbox; `useSessionNotificationRecord`, `useSessionNotificationSettings` and
  `useNotificationSeenMarks` read and write that record. Entries for deleted
  sessions are pruned, only after a complete read of the installation's
  sessions (`KagentApi.listSessionsIfComplete`); the backend now flags a session
  listing cut at its page limit as `truncated`. Settings writes read the stored
  value first and refuse to write on a read that failed. Adds the
  `AgentPlatform.sessionNotificationLevelChanged` event.
- eb2bbd1: The session page has a small "Show tool activity" switch on the line with its
  start time, on by default. Off, the conversation shows only the person's
  messages, the agent's replies, its questions and the request the session is
  waiting on; work summaries, reasoning and other permission requests are
  hidden. The choice is kept per person across sessions and reloads, and
  reported as `AgentPlatform.toolActivityChanged`.
- f94930d: Report more of what people do in the Agent Platform as usage data, with no
  names or other identifiers in any of these events:

  - A tool run from its page that returned a result is reported as
    `Muster.toolRan`, next to `Muster.workflowRan` for a workflow's. A
    connector tool run there reports the connector's event below instead.
  - Deleting an agent is reported as `AgentPlatform.agentDeleted` (`mode`:
    `apply` or `commit`).
  - Creating, editing and deleting a model is reported as
    `AgentPlatform.modelCreated`, `AgentPlatform.modelUpdated` and
    `AgentPlatform.modelDeleted`.
  - Editing a connector, in the wizard opened from its Edit or as JSON on its
    page, is reported as `Muster.mcpServerUpdated`; Activate, Deactivate and
    Reconnect as `Muster.mcpServerConnectionChanged` (`change`: `activated`,
    `deactivated`, `reconnected`), and Delete as `Muster.mcpServerDeleted`.

  - In a session, sending a message (a first message included), answering the
    agent's question, stopping a turn, renaming and deleting the session are
    reported as `AgentPlatform.messageSent`, `AgentPlatform.questionAnswered`,
    `AgentPlatform.turnStopped`, `AgentPlatform.sessionRenamed` and
    `AgentPlatform.sessionDeleted`, with nothing of the text, the answer or how
    it was given.

  `DefinitionEditorDialog` takes `saveTracking`, the event its save reports or
  the reason it reports none, in place of `saveUntrackedReason`.

- 0388b0e: A workflow's page has a Run it tab (`/agent-platform/workflows/<name>/run`),
  after Overview, that runs the workflow as a tool's page runs a tool: the input
  form from the workflow's input schema, the Run button with its note ("Runs as
  you.", "Nothing is changed."), and the result. Connectors its steps call that
  wait for the person's sign-in are named above the form. Without a muster
  session, on an installation without per-user muster sessions, or where muster
  lists no `workflow_<name>` tool for the person, the tab says why instead of
  showing a form. A run refreshes that workflow's run records. While a run is in
  flight, leaving the tab (another tab, a link, a reload) asks first and says
  that muster finishes the run anyway. The page's "Only reads" badge is now read
  off the tool catalogue the page already loads.

  The tool page and the Run it tab share `ToolRunPanel` and `useToolRun`, which
  reports the new `Muster.workflowRan` event for any run of a workflow's tool.
  `ShellPage` and `RouteTabs` take `onTabNavigate` / `onNavigate`, to hold a tab
  switch until the page agrees.

- 2b79a0c: `AgentPlatform.sessionStarted` takes `home` as an `entryPoint`, for a session started from the home page.

### Patch Changes

- 2b79a0c: On the agent wizard's Tools step, undoing a change to a preset-based toolset collapses it back to the preset, keeping what was added beside it, even after a round trip through another step, and a preset whose coverage cannot be read no longer shows its connectors as None. Leaving a session mid-turn ends its stream once the message has reached the agent, and a stalled turn reads "Not responding" instead of "Working". Pins, favorites and dismissed hints toggled in quick succession all persist, and pinning and favoriting are reported as `AgentPlatform.sessionPinChanged` and `AgentPlatform.agentFavoriteChanged`. A hand-off to a meta agent caps the draft it carries and refuses a prompt over the 32,000-character message limit before creating a session; that limit is now one constant in agent-platform-common.
- 2b79a0c: Rework the session view per product feedback.

  - **Platform-standard header.** Inside the agent-platform shell the session
    page now uses the same `ShellPage` frame as All Sessions and Customize: a
    breadcrumb reading "Sessions / Session" and the session's name as the h1 at
    the standard title scale, with the state badge, agent and installation
    beside it. The in-content title (which doubled the shell's "Sessions"
    header at an odd size and position) is gone; classic chrome keeps its own
    layout.
  - **Cost chip in the composer.** The cost/memory chip moved from the page
    header into the composer's controls, next to Send — always on screen with
    the docked box, as in the design. Its popover opens upward, drops the
    Agent row (the page is already that agent's session) and keeps a single
    explanatory sentence: the estimate's basis.
  - **Share UI removed for now.** The portal has no way to open a shared
    session, so the Share button, dialog, hooks and client surface are gone,
    along with the `AgentPlatform.sessionShared` telemetry event. The backend's
    share routes stay for kagent-compatible clients and a future UI.

- bbb9406: MCP servers that wait for the person's sign-in move from muster's corner card
  into the Agent Platform shell's Notification inbox: one row for the person's
  home installation, "2 MCP servers need your sign-in", naming the servers, with
  a Sign in that opens muster's sign-in dialog in place. The row counts in the
  bell's badge, the tab title, "Mark all read", the toasts and the desktop
  notifications. A server that starts to wait makes it unread again; a sign-in,
  in the dialog or on a muster page, takes it away. Marking the row read takes
  the place of the card's "Not now".

  `muster` no longer mounts its corner card (`McpAuthNotice`) on every page, and
  exports `McpSignInProvider` and `useMcpSignIn`: the home installation's MCP
  servers waiting for the person's sign-in and those connected, read every five
  minutes and when the tab regains focus under muster's query client, and
  `openSignIn` for its sign-in dialog, which loads on first use and opens only
  for the home installation. `useMcpServersAwaitingSignIn` also tells whether
  muster answered (`isAvailable`).

  `agent-platform`'s notification record adds `replaceSeenMark`, which writes a
  seen mark only while the stored one is still the mark it replaces, and its
  `SeenMarkReason` and `analytics-react`'s `AgentPlatform.notificationOpened`
  take the `mcpSignIn` kind: the MCP sign-in row's Sign in.
