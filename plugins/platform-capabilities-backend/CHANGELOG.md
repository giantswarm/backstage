# @giantswarm/backstage-plugin-platform-capabilities-backend

## 0.1.2

### Patch Changes

- Updated dependencies [b623ab3]
- Updated dependencies [06dfa3d]
- Updated dependencies [a05070d]
- Updated dependencies [ae00960]
  - @giantswarm/backstage-plugin-gs-node@0.6.0

## 0.1.1

### Patch Changes

- 10604ae: Report a Muster installation that cannot be reached to Sentry once, as one
  issue per kind of failure instead of one per installation. `MusterMcpClient`
  logs `Muster MCP request failed: <reason>` with the installation in the log
  metadata and throws the new `MusterUnreachableError` (a
  `ServiceUnavailableError`). Every backend router that calls muster answers it
  503 through `musterUnreachableErrorHandler()`, with the body the error
  middleware sends, so the middleware no longer reports the same failure again;
  the plans, roadmap, platform-capabilities and repositories routers no longer
  read its text as one of GitHub's 403, 404 or 429 answers, and the GitHub token
  router logs it at `info`. A lost session that the client re-initializes and
  retries is logged at `info` instead of `warn`, and a warning says so when one
  installation, across all of the backend's muster clients, loses ten sessions
  within ten minutes. The error text the person sees is unchanged, except that
  `list_tools` still being truncated after 20 pages no longer names the
  installation.
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

- Updated dependencies [10604ae]
- Updated dependencies [5bde8bf]
- Updated dependencies [4c53a2b]
  - @giantswarm/backstage-plugin-gs-node@0.5.0

## 0.1.0

### Minor Changes

- 583fb43: Enable and Apply changes ask **Why this change** on the review step: the pull requests open only once it is filled, and the reason goes to the platform manager with the commit (`reason`), which requires it and shows it to the team in the approval request above what changes. The backend passes `reason` through to `enable_capability` and `reconcile_capability`.
- 90ddd8d: **Run them as you** on the Capabilities tab runs the cluster checks on the manager's one
  muster registration: `POST .../verify-live` calls `verify_installation` on
  `platformCapabilities.muster.server`, the same gateway the comparison and the actions use, with
  the same request and answer. A person without the grant is sent through muster's connect, as
  for every other call. The second gateway and its `platformCapabilities.muster.liveServer`
  option (default `<server>-live`) are removed; the key is ignored where a config still carries it.

### Patch Changes

- 6909d96: `GET /installations?summary=true` forwards `summary: true` to the manager's
  `list_installations`: the states and the last actions alone, what the
  Installations page's columns ask for.
- ba553f1: Read the muster, ai-chat, agent-platform and flux frontend config from the
  signed-in config (`GET /api/gs/config`) instead of the public `index.html`.

  `muster.serverName` and `muster.installations[].name/authProvider` (the
  fleet's codenames), `aiChat.welcome.*`, `aiChat.mcp[].name/authProvider`,
  `aiChat.contextWindow`, `agentPlatform.skills.repositories` and
  `flux.gitRepositoryPatterns` keep the default (backend) visibility and reach
  the browser after sign-in through `@giantswarm/backstage-plugin-gs-react`.
  The plans, platform-capabilities, repositories and roadmap backends drop the
  `@visibility frontend` markers no frontend read, so the public config no
  longer names their muster installation, repositories, board or teams. No
  `@visibility frontend` is left in these plugins.

- Updated dependencies [71317f9]
- Updated dependencies [9d0caee]
- Updated dependencies [85e7d8c]
- Updated dependencies [b63373b]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [50c2f49]
- Updated dependencies [25fc7da]
- Updated dependencies [846f143]
- Updated dependencies [55db519]
- Updated dependencies [5851bba]
- Updated dependencies [3198f83]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
- Updated dependencies [c3ec30a]
- Updated dependencies [103014c]
- Updated dependencies [167c24c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-node@0.4.0
