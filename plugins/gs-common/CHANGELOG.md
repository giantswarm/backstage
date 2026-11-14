# @giantswarm/backstage-plugin-gs-common

## 0.24.0

### Minor Changes

- c775cfb: Fixture mode's data, outside production builds only. `@giantswarm/backstage-plugin-gs-common/fixtures` builds a seeded data set of installations, organizations, agents, connectors, sessions, workflows and executions, with a count, a least name length and the states for each list; the base data set has every state, and only made-up names. muster and agent-platform map its records onto the types their clients read. Fixture mode serves three made-up installations, `FIXTURE_INSTALLATIONS` in gs-common, instead of one. kubernetes-react exports `AGENT_BLOCKED_REASON`.
- 694e2ae: Fixture mode for the muster and agent-platform plugins, outside production builds only. `muster.fixtures` serves one signed-in installation from memory, its tool calls answered by the fixture MCP servers that plugins attach to `api:muster/muster` (`fixtureMcpServersDataRef`); a tool no fixture handles fails with an error. `agentPlatform.fixtures` serves kagent, model-manager and agent-manager's credential operations from memory. With `gs.fixtures` the app serves a Kubernetes API without a cluster for the installations, and their cluster access reads as healthy; `gs.authProvider` is optional in the config schema, as the code already treated it. `yarn fixtures start` runs the portal in fixture mode on free ports of its own. `gs-common` exports `FIXTURE_INSTALLATION` and `FIXTURE_MCP_SERVERS`, which every fixture reads.
- b623ab3: muster's own entry among the connectors shows the logo muster announces, and
  the portal calls the product "Muster".

  - gs-common: `connectorIconOf`, the check a connector's icon passes before it
    goes into an `<img src>`, moves here from the muster plugin (which still
    exports it), and `serverInfoIconOf` picks an icon it accepts from an MCP
    `initialize` result's `serverInfo.icons`: the first without a `theme`, else
    the first of all.
  - gs-node: `MusterMcpClient.serverIcon` reads that icon off the caller's
    cached muster session; it opens no connection of its own where one is open.
  - muster-backend: `GET /server-info` answers `{ icon }`, muster's logo from its
    `initialize` result (muster v5.59.0 or later), as the person. A muster that
    announces none answers `{}`; one that cannot be asked answers
    `{ unavailable: true }`, both with HTTP 200. A token that is missing,
    expired or refused by muster answers 401.
  - muster: `MusterApi.getServerInfo`, the hook `useMusterIcon`, and
    `useConnectorIcon`, the one rule for a connector's logo (muster's own, a
    server's `.status.icon`, a family's representative's). muster's row in the
    Connectors list and its page's header show the logo as an image, and the
    letter tile where there is none; an answer muster could not give is asked
    again within half a minute. The entry's name reads "Muster"
    (`MUSTER_DISPLAY_NAME`), and the plugin's copy calls the product "Muster";
    URLs, links, query keys and server names keep `muster`.

- 06dfa3d: More muster tool errors get their own status instead of a 500.

  - gs-node: muster's `Tool not found: x`, its answer for a meta-tool's target
    (`describe_tool`), is `tool_not_found` (502) like `tool not found: x`.
    model-manager's `forbidden:` is a refusal (403, out of Sentry), and its
    `no_backend:` the new kind `no_backend` (503). A tool error of no known
    kind stays 500.
  - gs-common: `forbidden` is one of model-manager's refusal codes.
    `MODEL_MANAGER_FAILURE_CODES` and `mcpToolFailureOf` name the failures of a
    whole server, model-manager's `no_backend` for now, next to the refusals.
  - agent-platform: model-manager's `forbidden` reads as a `ForbiddenError` and
    `no_backend` as a `ServiceUnavailableError`, neither retried.
  - backend-common: `no_backend` events are grouped per server in Sentry. A
    server-wide kind whose tool names no server (a meta-tool's missing target)
    is grouped by its message instead of all in one issue.

- a05070d: Tool calls from the portal declare MCP URL mode elicitation (protocol 2026-07-28). When muster answers that the person must open a page first, a sign-in to the tool's server or a server's own page such as a credential form, the portal shows it in the consent dialog and sends the call again with the person's answer (accept, decline or cancel). The same page asked by the same server is not asked about again for two minutes. `MusterMcpClient` calls that pass `urlElicitation` run on `@modelcontextprotocol/client` and throw `MusterInputRequiredError` (428) for muster's `input_required` answer. `gs-common` adds the wire types (`MusterInputAnswer`, `MusterUrlElicitation`, `inputRequiredBodyOf`) and now holds `musterServerOfTool`, which `gs-node` re-exports. `MusterApi.callTool` takes an optional `signal`, which also cancels a retry muster holds until a sign-in completes, and a tool's Run shows Cancel while a run is pending.

### Patch Changes

- d97c11d: Fixture mode serves workspace-manager, toolchain-manager and skill-manager, outside production builds only: their tools answer from the base data set, so the Workspaces, Toolchains and Skills tabs, their detail and edit pages, and the New session dialog's workspace and toolchain pickers show data without a cluster. The data set of `@giantswarm/backstage-plugin-gs-common/fixtures` gains builders for provider owners and repositories, workspaces, toolchain sources and toolchains, and skill repositories. Writes are kept in memory until the page reloads; a sync runs for a few seconds, and a new toolchain's pull request moves through its checks.
- 3b65ce4: Fixture mode serves muster's data, outside production builds only: the connectors in every state, their tools, resources and prompts, the person's sign-in status, toolsets and presets, the workflows and their runs with steps and statistics, and MCP usage and latency, all from the base data set; the unreachable installation's reads fail as they do for real. `@giantswarm/backstage-plugin-muster/fixtures` exports the `MCPServer` and `Workflow` objects the fixture Kubernetes API lists, and the fixture data set has toolset presets.

## 0.23.0

### Minor Changes

- 36f0927: Show Envoy Gateway policies in the cluster "Gateways" tab.

  - `SecurityPolicy`, `BackendTrafficPolicy`, `ClientTrafficPolicy` and
    `EnvoyExtensionPolicy` with their targets (`spec.targetRefs`, and the
    deprecated `spec.targetRef`; policies using `spec.targetSelectors` show
    "Selected by labels") and the `Accepted` condition per Gateway or
    ListenerSet they attach to. Rejected policies are listed first.
  - A policy without any status on a cluster that exports policy status is
    flagged as "No status reported": Envoy Gateway writes none when the target
    doesn't exist, isn't managed by it, or before reconciling.
  - Policy status and `spec.targetRefs` come from metrics added in
    observability-bundle 3.6.0 (giantswarm/observability-bundle#467); the
    deprecated `spec.targetRef` is read on older bundles too. On clusters with
    an older bundle, or when they fail to load, they are shown as "Not
    available", with a notice saying which of the two it is.
  - `@giantswarm/backstage-plugin-gs-common` exports the Envoy Gateway policy
    metrics (`EnvoyGateway*PolicyCreated`, `*Info`, `*TargetInfo`,
    `*StatusAncestorAccepted`).

- 5ded107: A Tags field the installation does not offer (an older muster or agent-manager) no longer yields a problem, so an edit of a connector with more than 50 stored tags on such a muster no longer bounces from Sign-in back to Connect. Tags under five characters are no longer offered as near-duplicates of each other (`docs`, `dogs`). `TagVocabularyProvider` and `SharedTagsProvider` move to their own component directories; muster's `useConnectorGroupPaths` is now `useConnectorListPaths`, and `useTakesDisplayName`/`useTakesTags` are one `useToolTakesArgument`.

  The 50-tag limit is checked as muster checks it (`exceedsTagLimit` in gs-common): a list past 50 is refused only when it holds a tag not already stored, so an unchanged or shortened list of tags written elsewhere goes through, and a create takes at most 50. gs-backend's skill pull request checks it against the SKILL.md's stored `metadata.tags` (a 422) instead of capping every request at 50.

- 5ded107: The tag rule lives in `gs-common` (`TAGS_ANNOTATION`, `MAX_TAG_LENGTH`, `MAX_TAGS`, `TAG_PATTERN`, `isValidTag`, `parseTags`), which `ui-react` re-exports and gs-backend checks skill tags against. A skill edit that changes the tags of a SKILL.md whose `metadata.tags` is not a comma-separated list of tags (a YAML list, or a part like `on call`) is refused with a 422 instead of dropping what the form could not show.
- 5bde8bf: Report a Mimir that cannot answer a query to Sentry once, under a fixed title,
  and say on the page when older data is temporarily unavailable.

  `MimirService` logs a Mimir that is down, slow or failing once as a warning
  with a fixed message (`Mimir answered a query with HTTP <status>`,
  `Mimir could not be reached`, or
  `Mimir could not read older data: no healthy store-gateway`), with the
  installation, the status and Mimir's own error text in the metadata, and throws
  the new `MimirUnavailableError`. Its message no longer carries Mimir's body;
  that stays in the warning (`mimirError`, left out of the answer to the
  browser), and a connection error no longer names the query. A query Mimir
  refused (a 4xx other than a refused token: bad PromQL, a range over its limits)
  is an `InputError` (400) with Mimir's text instead, not logged and not retried
  by the frontend. `query({ logFailures: false })` logs at `debug` for a caller
  that handles the failure itself, as the model cost route does. The gs
  backend's `/mimir/query` and `/mimir/query_range` routes answer a
  `MimirUnavailableError` 503 themselves, so the error middleware no longer
  reports it again. A Mimir without a healthy store-gateway answers
  with `error.reason: 'older_data_unavailable'` (`MIMIR_UNAVAILABLE_REASONS` in
  gs-common), and the model cost route answers `older-data-unavailable`.

  gs-node's answer-it-in-the-router pattern is now generic:
  `ReportedServiceUnavailableError` with `reportedErrorHandler()`, which replaces
  `musterUnreachableErrorHandler()` (`MusterUnreachableError` is one), and
  `errorResponseBody()` for a router that answers some other error with the body
  the error middleware would send.

  ui-react adds `MetricsUnavailableAlert` (with a `fallback` for a caller whose
  generic failure is a line of text), `describeMimirFailure` and
  `pickMimirError`, which every place that shows a failed Mimir read now uses: a
  deployment's resource usage and hostnames, a cluster's gateways and node pool
  nodes, the workload status summary, the Usage overview and cost pages, the
  activity heatmap, an agent's and a model's Usage tab, and the cost estimate and
  actual-cost hints.
  `MimirClient` throws a `MimirQueryError` that carries the backend's `reason`.

- 4c53a2b: Name the tool, its MCP server and the installation on a muster tool error, and give each known kind of failure its status: the refusals of agent-manager, model-manager and workspace-manager and muster's refusals of a connector write answer 4xx and no longer reach Sentry, a muster rollout's interruption is logged at info and answered with a 503 the muster, plans and roadmap pages retry, and a timeout (504), a server muster holds no connection to (503) and a missing tool (502) stay reported. Sentry groups muster tool errors by kind and tool, or by server for the kinds that belong to a whole server. The muster pages no longer retry a refusal. platform-capabilities and repositories no longer show muster's own failures as the manager's refusal. `gs-node` adds `MUSTER_TOOL_ERROR_STATUS`, `musterToolErrorKindOf`, `musterServerOfTool` and `markReported`; `gs-common` adds the refusal registry (`mcpToolRefusalOf`, `parseToolErrorCode`). bot-prs keeps offering the marge sign-in for a missing tool or a lost connection.

## 0.22.0

### Minor Changes

- 9312feb: The agent page's Technical details drop the Resource card's "Copy system
  prompt" button, show the agent's namespace and name as two facts, Namespace
  and Name, and link each skill version to its skill's page. The model and
  connector pages' Technical details split their resources the same way; a
  reference in the agent's own namespace (its ModelConfig, a sub-agent, the
  HelmRelease behind it) is named alone. The Configuration card's "See tools" is
  bui's link.

  Every git SHA the portal shows is 7 characters, a digest 12, with the full
  value as its title and a copy button on touch screens: skill pins and
  versions, agent revisions, workspace heads, Flux revisions and digests,
  branch-build versions, the release footer, scaffold and revert commits, and
  the backend's messages.

  New in `gs-common`: `shortSha`, re-exported by `ui-react`. New in `ui-react`:
  `CommitSha` and `namespacedNameFacts`.

- 21ae39b: Export `ReleaseReadinessFlags` and `releaseReadinessFlagNames` — the release
  blockers `AppReadinessProcessor` writes into `giantswarm.io/readiness-flags`.

  That annotation has two authors: `backstage-catalog-importer` merges its enforced
  chart-metadata gaps into the same list. Consumers have to tell the two apart to
  attribute each flag to the verdict it came from, and they do so by recognising
  these names, so they belong in one shared place rather than being duplicated on
  each side of the package boundary.

- 2fa183d: New `BuildStatusProcessor`: records whether a component's default branch
  builds, as the `giantswarm.io/build-status` label (`passing` / `failing` /
  `unknown`), the confirmed failing checks in `giantswarm.io/build-failing-checks`
  (a JSON array, since check names contain commas),
  the branch in `giantswarm.io/default-branch`, and `BUILD-RED` merged into
  `giantswarm.io/readiness-flags` when failing. Off by default
  (`catalog.processors.buildStatus.enabled`).

  GitHub hangs commit statuses off a SHA, so a red from a branch cut off main, a
  merge-queue branch or a tag shows up on main. Each failing status is therefore
  resolved through the CircleCI build behind it and counted only when that build
  really ran on the default branch and really reached a verdict; tag builds and
  other branches' builds are set aside. `passing` needs positive evidence: a
  context still running, cancelled or pending on the default branch, a red that
  cannot be resolved, or a rollup whose every context was set aside is `unknown`,
  never `failing` and never `passing`; a skipped or neutral check is not evidence
  either, and where CircleCI reports to the commit only a green CircleCI build of
  the default branch is (a green pre-commit or scorecard workflow says nothing
  about whether the build runs). When a lookup fails (GitHub 5xx, CircleCI rate limit) the last known
  verdict is kept for up to a day with its original `build-status-checked`, rather than every
  affected component flipping to `unknown` for a pass. A repository GitHub cannot find writes
  nothing, and a missing GitHub token is warned about once per owner rather than
  written as `unknown`. The release verdict in `giantswarm.io/readiness` is not
  touched.

  `gs-common` exports `BuildReadinessFlags` / `buildReadinessFlagNames` next to the
  release flags, so the frontend can attribute the flag to the build rather than
  to the release or to chart metadata. `TtlCache` moves to
  `catalog-backend-module-gs/src/util` and is shared by both processors.

- e5bd97a: The Installations page shows every installation's versions again. The backend reads only the installations it can read as the signed-in person (the main installation, the ones the cluster token broker covers, the ones the Kubernetes plugin authenticates to itself) within one 15-second deadline per installation, and leaves the others (their own OIDC sign-in, a `backendUrl` override) to the browser, as before. An expired session shows "Not signed in", a failed read a short status with the details on hover, and the answer is no longer persisted to the browser's storage, where the next person to sign in on the same browser saw it. The subject token header and the endpoint's types live in `gs-common`.
- 846f143: A person who has not signed in to cluster-manager sees "Sign in to
  cluster-manager to see GPU node pools" with its Sign in on the GPU capacity
  and model cache views (and on Add GPU node pool's cluster list) instead of an
  authentication error, and the view fills in once the sign-in lands. Every
  `401` from muster-backend now says why in `error.reason`
  (`server_sign_in_required` with the server, `token_missing`, `token_expired`,
  `token_rejected`) and is logged with it. The muster client refreshes the
  forwarded token ahead of its expiry, sends a call once more after a refresh
  for a refused token, and no query retries a muster `401` with backoff. New
  exports: `ConnectorSignInAlert`, `splitConnectorSignIns`,
  `musterSignInRequiredOf`, `musterUnauthorizedInfoOf`, `isMusterAuthFailure`,
  `shouldRetryMusterQuery`, `MusterUnauthorizedError` and the
  `MusterUnauthorizedReason` type (muster); `MusterUnauthorizedError` and
  `toMusterUnauthorizedError` (gs-node); `MUSTER_UNAUTHORIZED_REASONS`,
  `MUSTER_TOKEN_REASONS`, `isMusterUnauthorizedReason`,
  `MUSTER_TOKEN_EXPIRED_TEXT` and `MusterUnauthorizedReason` (gs-common, the
  contract both sides share).
- cba71a8: An agent turn (a message, streamed or not, and the answer to a confirmation)
  goes out with an ID token that has at least 25 of its 30 minutes left, so a
  long turn no longer fails part-way with `Unauthorized` when the token the
  session had cached runs out. The session is refreshed silently first when its
  token has less of its lifetime left; reads keep Backstage's 3-minute margin. A
  turn whose token could not be refreshed is still sent, with a console warning.

  - `gs`: the Kubernetes auth APIs (`LastingAuthApi`) carry
    `getLastingIdToken(minLifetimeLeft)`; its refresh never opens a sign-in.
  - `gs-react`: `idTokenLifetimeLeft` and `hasIdTokenLifetimeLeft`.
  - `gs-common`: `readJwtClaims`, `readJwtLifetimeClaims` and
    `jwtLifetimeSeconds`, the one unverified JWT claims reader of frontend and
    backend.
  - `kubernetes-react`: `getInstallationOidcToken` takes `{ minLifetimeLeft }`.
  - `auth-backend-module-gs`: `POST /cluster-token/:installation` takes
    `?minLifetimeLeft=` and re-exchanges a cached token with less of its
    lifetime (`exp` − `iat`, on the issuer's clock) left.

- 103014c: The Version History card and tab list only stable releases by default. A "Show all" switch brings back release candidates and dev builds. Stable means a semantic version without a pre-release part (`isStableVersion` in `gs-common`).

  The backend parses and compares versions with `@giantswarm/semver-ts` instead of npm `semver`, so tags are read the way Flux reads them (Masterminds/semver): `sortVersions` in `gs-node` now also drops tags that are no version, and accepts incomplete ones such as `1.2`. GitHub release tags in the app readiness check are still parsed strictly, so a date-named release is not mistaken for a version.

  `ContainerRegistryService.getTags` without a `limit` now follows the registry's pagination (`Link: rel="next"`), so the version history lists every tag instead of the 100 most recent ones ACR returns on its first page. With a `limit` it stops once it holds that many tags, which for the catalog processors' limit of 500 is a single request. The OCI path now honours `limit` and asks for pages of 1000 tags, as the ACR path asks for 999.

- 0af6fea: Usage → Your sessions shows your actual model cost, as the gateway priced
  it, instead of an estimate: in the totals strip ("Cost", "All your model
  calls") and per agent. It covers every model call made as you, in your
  sessions or not, and the tooltips say so. Where it cannot be read (kagent
  names no one, the gateway records no user, none of your calls was priced, or
  Mimir is down), the page falls back to the estimate, labelled "Est. cost",
  with the reason. The description drops "Overview and Cost cover every user's
  model calls."

  The figure comes from a new route, `GET /api/agent-platform/usage/model-cost`,
  which takes the person from kagent (`GetCurrentUser`, with their own token)
  and builds the query itself, so no request can read anyone else's cost.
  `MimirService` and `mimirServiceRef` move from gs-backend to gs-node, the
  metric registry from gs to gs-common (`mimirMetrics.ts`, still re-exported
  by gs), and `counterIncrease` to agent-platform-common.

## 0.21.1

### Patch Changes

- 610ead0: Add `LatestOciReleaseProcessor` that annotates `Component` entities carrying `giantswarm.io/helmcharts` with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` from the referenced OCI registry. For multi-chart entities the highest-semver stable tag wins; prerelease tags are skipped. Toggle via `catalog.processors.latestOciRelease.enabled`.

  Introduce a new `@giantswarm/backstage-plugin-gs-node` node-library package and move the container-registry client code (`ContainerRegistryService`, `AcrRegistryClient`, `OciRegistryClient`, `RegistryAuthClient`, `RegistryError`, registry utils, and `containerRegistryServiceRef`) into it so it can be shared between `gs-backend` and the catalog module. Move `parseChartRef` from `plugins/gs` to `gs-common` so it can be used backend-side.

## 0.21.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.20.1

### Patch Changes

- b1b1b7a: Move GitOpsCard and related utilities from gs plugin to flux-react.

## 0.20.0

### Minor Changes

- d6b1c2d: Removed Kubernetes object types and types generator script.

## 0.19.1

### Patch Changes

- f740242: Added support for API version v2 of HelmRelease

## 0.19.0

### Minor Changes

- 8685deb: Added Flux overview UI.

## 0.18.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

## 0.17.0

### Minor Changes

- 7eb690b: Added possibility to configure how Kubernetes resources annotations are being displayed.

## 0.16.2

### Patch Changes

- cca7808: Fixed source reference namespace for Kustomization objects.

## 0.16.1

### Patch Changes

- 673eb67: Improved ReleasePicker scaffolder field to allow to filter releases by provider.

## 0.16.0

### Minor Changes

- df8b489: Added Cloud Director support.

## 0.15.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

## 0.14.0

### Minor Changes

- 93f0340: Added GitOps indicator to the Deployment details pane.

## 0.13.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

## 0.12.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

## 0.11.0

### Minor Changes

- 6ed2cbb: Made GitOps indicator link configurable via app configuration.

## 0.10.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- f99862c: Refactored data fetching hooks to share common logic.

## 0.9.0

### Minor Changes

- d5e7820: Added "Managed through GitOps" indicator to cluster details.

## 0.8.1

### Patch Changes

- 0b15773: Fixed how cluster type is determined for deployments.

## 0.8.0

### Minor Changes

- 60cf504: Split SOURCE column in deployments table into SOURCE and CHART NAME.
- 60cf504: Fixed missing values in CLUSTER column in deployments list.
- 60cf504: Added links to cluster details from deployments table and deployment details pane.
- 60cf504: Added CLUSTER TYPE column to deployments list.

## 0.7.3

### Patch Changes

- b5f0dcb: Changed AWS ACCOUNT ID column in clusters list to display value with color hashing and link to AWS account.
- 055dcb4: Changed CLUSTER APP column in clusters list to display provider specific cluster app version.

## 0.7.2

### Patch Changes

- e671231: Fetch only supported infrastructure cluster identity resources.

## 0.7.1

### Patch Changes

- 9243e49: Fetch infrastructure cluster resources only for supported providers.

## 0.7.0

### Minor Changes

- 20eab6a: Added column AWS ACCOUNT ID to clusters list
- 20eab6a: Added column LOCATION to clusters list

## 0.6.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

## 0.5.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

## 0.4.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.

## 0.3.0

### Minor Changes

- 291a42f: Add script to autogenerate TypeScript types for K8s resources.
- 291a42f: Refactor K8s resources management.

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.
