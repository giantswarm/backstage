# @internal/backend-common

## 0.6.2

### Patch Changes

- df69454: With `NODE_USE_ENV_PROXY=1`, the backend refuses to start on a Node version that would let native `fetch` bypass the proxy, and the error names the version it needs (24.17 or later; Node 22 and Node 25 do not qualify). On those versions, Node's own proxy support did not stay in charge of `fetch` as the earlier entry said: loading undici 8 replaced Node's proxy dispatcher with a direct one, so catalog URL reads, the scaffolder and most plugins silently went around the proxy. `configureFetchProxy` runs the check through the new `assertEnvProxySupported`.
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

## 0.6.1

### Patch Changes

- 4c53a2b: Name the tool, its MCP server and the installation on a muster tool error, and give each known kind of failure its status: the refusals of agent-manager, model-manager and workspace-manager and muster's refusals of a connector write answer 4xx and no longer reach Sentry, a muster rollout's interruption is logged at info and answered with a 503 the muster, plans and roadmap pages retry, and a timeout (504), a server muster holds no connection to (503) and a missing tool (502) stay reported. Sentry groups muster tool errors by kind and tool, or by server for the kinds that belong to a whole server. The muster pages no longer retry a refusal. platform-capabilities and repositories no longer show muster's own failures as the manager's refusal. `gs-node` adds `MUSTER_TOOL_ERROR_STATUS`, `musterToolErrorKindOf`, `musterServerOfTool` and `markReported`; `gs-common` adds the refusal registry (`mcpToolRefusalOf`, `parseToolErrorCode`). bot-prs keeps offering the marge sign-in for a missing tool or a lost connection.

## 0.6.0

### Minor Changes

- 89e1d7d: The backend routes Node's native `fetch` through the `GLOBAL_AGENT_HTTP_PROXY` / `GLOBAL_AGENT_HTTPS_PROXY` proxy, honouring `GLOBAL_AGENT_NO_PROXY`. `global-agent` only patches the `http`/`https` modules, so behind an egress proxy the catalog's URL reads (locations, templates) failed with `fetch failed`. `@internal/backend-common` exports `configureFetchProxy`, which installs undici's `EnvHttpProxyAgent` as the global dispatcher; with `NODE_USE_ENV_PROXY=1` Node's own proxy support stays in charge.
- efa48a7: The backend reads GitHub files and trees from branches and tags whose name contains a slash, such as a scaffolder template at `https://github.com/<org>/<repo>/blob/feat/x/templates/t/template.yaml`. The default GitHub URL reader took `feat` for the branch and `x/templates/...` for the path, so the read failed with not found. `@internal/backend-common` exports `githubUrlReaderFactory`. It reads every URL as before and only when that finds nothing looks up the longest branch, else tag, that the path starts with, and reads its commit; files found by a search keep the ref in their URL.

## 0.5.0

### Minor Changes

- 89aa3f2: Use custom X-Backstage-Token header for Backstage identity tokens to avoid conflicts with ingress-level Basic auth on the Authorization header.

## 0.4.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.3.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

## 0.2.0

### Minor Changes

- 4c21763: Added a headless backend package to serve auth and scaffolder plugins separately from the main backend instance.
