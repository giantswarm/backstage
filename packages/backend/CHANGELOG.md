# backend

## 0.21.0

### Minor Changes

- 8e0d7ab: The backend exports OpenTelemetry traces over OTLP. `packages/backend/src/instrumentation.js`, loaded with `--require` ahead of the backend (the image's `NODE_OPTIONS` and `yarn start`), starts the OpenTelemetry Node SDK with the auto-instrumentations (HTTP, Express, undici, pg, Knex and the rest, without `fs`, `dns` and `net`) when an OTEL_* variable names an exporter: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_TRACES_EXPORTER`. Every setting is a standard OTEL_* variable; `service.name` defaults to `backstage`, and metrics and logs stay off unless their own variable is set. Without any of them the SDK is not loaded.

### Patch Changes

- 5861ae8: OTLP trace export: the knex instrumentation is off. It named its spans after the connection's database, which a `pg` connection in `pluginDivisionMode: schema` does not set, so spans read `raw undefined`, and a schema-builder query produced a span without a name. That span failed the exporter's serializer and dropped the whole batch as an unhandled rejection. The pg instrumentation traces the same queries under proper names.
- db58c71: Replace the `@devangelista/backstage-scaffolder-kubernetes` and
  `@aws/aws-core-plugin-for-backstage-scaffolder-actions` scaffolder plugins with
  an in-repo `kube:apply` action in the GS scaffolder backend module.

  - `kube:apply` keeps the exact action ID and input schema
    (`manifest`, `namespaced`, `clusterName`, `token`), so existing templates —
    including the hidden `agent-deployment` template driven by the Agent Platform
    create flow — keep working unchanged. It resolves clusters from
    `kubernetes.clusterLocatorMethods` (type `config`) the same way as before:
    OIDC clusters use the per-task user token, `serviceAccount` clusters their
    static token, with a fallback to the default kubeconfig.
  - The other actions from those plugins (`kube:delete`, `kube:job:wait`,
    `aws:cloudcontrol:create`, `aws:codecommit:publish`, `aws:eventbridge:event`,
    `aws:s3:cp`) have no usage in any template and are dropped.
  - The devangelista plugin pinned old `@backstage/*` and
    `@kubernetes/client-node` ranges, nesting ~185MB of duplicate dependencies
    (including the deprecated `@backstage/backend-common`, which is now gone
    entirely); the AWS plugin nested another ~80MB of duplicate `@aws-sdk`
    clients. Together with a `yarn dedupe`, `node_modules` shrinks by roughly
    850MB, most of which was shipped in the backend image.

- 7e1ab9f: Stop serving the frontend source maps. The backend image now deletes
  `packages/app/dist/**/*.map` after unpacking the bundle, so `/static/*.js.map`
  returns 404 instead of the un-minified app source and anything inlined into it
  at build time. Backend source maps are untouched.
- 40e0039: Raise the transitive-dependency CVE `resolutions` to the currently-fixed versions so the High count in the published image is cut substantially (the previous pass cleared all fixable Critical findings but pinned to point-in-time versions that newer CVEs have since flagged). Updated/added pins: `tar` 7.5.11, `undici` v5 line to 6.27.0 and v7 lines to 7.28.0, `axios` v1 line to 1.16.0 and v0 line to 0.32.0, `protobufjs` 7.6.1, `basic-ftp` 5.3.1, `form-data` v2 to 2.5.6 and v4 to 4.0.6, `multer` 2.2.0, `node-forge` 1.4.0, `ws` 8.21.0, `fast-xml-builder` 1.1.7, and `minimatch` (3.x→3.1.4, 5.x→5.1.8, 7.4.x→7.4.8, 9.x→9.0.7, 10.x→10.2.3).
- dcdc3ec: Force fixed versions of vulnerable transitive npm dependencies via yarn `resolutions` to remediate the Critical/High CVEs that dominate the published `giantswarm/backstage` image scan. The OS base (`node:24-trixie-slim`) was already clean; every finding was in the bundled Node.js dependency layer. Pinned: `vm2` 3.11.5, `sha.js` 2.4.12, `protobufjs` 7.5.5, `basic-ftp` 5.2.0, `jsonpath-plus` 10.3.0; `fast-xml-parser` v4 line to 4.5.4 (v5 consumers untouched), `form-data` v2 line to 2.5.4 (v4 already fixed), `path-to-regexp` `~0.1.12` to 0.1.13, `axios` v1 line to 1.8.2, `tar` v6 line to 7.5.3, `undici` v5 line to 6.21.2, and `minimatch` `^10.0.0` to 10.0.3.
- Updated dependencies [2c4e7eb]
- Updated dependencies [f3ab798]
- Updated dependencies [66a96ae]
- Updated dependencies [1c9a904]
- Updated dependencies [343d4b2]
- Updated dependencies [6b1e119]
- Updated dependencies [0395e2d]
- Updated dependencies [be7ef02]
- Updated dependencies [ab3560e]
- Updated dependencies [7273a37]
- Updated dependencies [5804cd2]
- Updated dependencies [c1b3690]
- Updated dependencies [2aaf08d]
- Updated dependencies [d6bec76]
- Updated dependencies [f47e1e7]
- Updated dependencies [fedd5d8]
- Updated dependencies [b30a7fc]
- Updated dependencies [b30a7fc]
- Updated dependencies [d0e8ef4]
- Updated dependencies [408bdfe]
- Updated dependencies [c691e06]
- Updated dependencies [71317f9]
- Updated dependencies [21ae39b]
- Updated dependencies [9c3a9c4]
- Updated dependencies [85e7d8c]
- Updated dependencies [0a10f54]
- Updated dependencies [2c105cc]
- Updated dependencies [9fd228e]
- Updated dependencies [db58c71]
- Updated dependencies [a1292a5]
- Updated dependencies [8967f50]
- Updated dependencies [37c3eb0]
- Updated dependencies [e2958de]
- Updated dependencies [e9a6141]
- Updated dependencies [0b2fa7f]
- Updated dependencies [8402eee]
- Updated dependencies [5c82125]
- Updated dependencies [87b1c2e]
- Updated dependencies [69eaff0]
- Updated dependencies [3b465ec]
- Updated dependencies [d200952]
- Updated dependencies [c8743f8]
- Updated dependencies [5851bba]
- Updated dependencies [6205cca]
- Updated dependencies [7ff288f]
- Updated dependencies [5f09b20]
- Updated dependencies [c604256]
- Updated dependencies [6b18a17]
- Updated dependencies [70eeb29]
- Updated dependencies [92f025f]
- Updated dependencies [954a810]
- Updated dependencies [54ea033]
- Updated dependencies [28aada8]
- Updated dependencies [02f726e]
- Updated dependencies [5d8b87b]
- Updated dependencies [8fe23f0]
- Updated dependencies [d419735]
- Updated dependencies [cd1b0b0]
- Updated dependencies [d817adf]
- Updated dependencies [0987634]
- Updated dependencies [0bba1e6]
- Updated dependencies [f2af09f]
- Updated dependencies [6909d96]
- Updated dependencies [90ddd8d]
- Updated dependencies [cad8b48]
- Updated dependencies [34d161d]
- Updated dependencies [f46a45f]
- Updated dependencies [beda76b]
- Updated dependencies [b863d7c]
- Updated dependencies [b6a5641]
- Updated dependencies [7a5904a]
- Updated dependencies [6ead0ab]
- Updated dependencies [3c8bcd0]
- Updated dependencies [406698c]
- Updated dependencies [5337c75]
- Updated dependencies [2950a35]
- Updated dependencies [d7b3983]
- Updated dependencies [0814404]
- Updated dependencies [4785d59]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [6662c03]
  - @giantswarm/backstage-plugin-agent-platform-backend@1.0.0
  - @giantswarm/backstage-plugin-gs-backend@0.11.0
  - @giantswarm/backstage-plugin-ai-chat-backend@0.18.0
  - @giantswarm/backstage-plugin-muster-backend@0.3.0
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.7.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.16.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.13.0
  - @giantswarm/backstage-plugin-plans-backend@0.1.0
  - @giantswarm/backstage-plugin-roadmap-backend@0.1.0
  - @giantswarm/backstage-plugin-platform-capabilities-backend@0.1.0
  - @giantswarm/backstage-plugin-repositories-backend@0.1.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.10.1

## 0.20.7

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.15.0

## 0.20.6

### Patch Changes

- Updated dependencies [5b7e7ba]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.14.0

## 0.20.5

### Patch Changes

- c117a5e: Support muster MCP servers behind per-user auth (`authProvider` entries in
  `aiChat.mcp`): the muster frontend now forwards the user's OAuth token to the
  muster-backend proxy, which opens per-user MCP sessions. Previously such
  servers were reported as unconfigured and the Workflows page failed with a 503.

  Also addresses review feedback on the initial muster plugins: the shared MCP
  client cache moved from ai-chat-backend to `@giantswarm/backstage-plugin-gs-node`
  and is reused by muster-backend; config parsing no longer throws on unnamed
  `aiChat.mcp` entries; muster-backend uses `@backstage/errors` classes instead
  of a hand-rolled error middleware; query parameter validation rejects empty
  and repeated values; execution fetch errors are surfaced in the UI instead of
  being silently swallowed; duplicate workflow step ids no longer drop nodes
  from the graph; and `formatDuration` is shared instead of copy-pasted.

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-muster-backend@0.2.0
  - @giantswarm/backstage-plugin-ai-chat-backend@0.17.2
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.6.1
  - @giantswarm/backstage-plugin-gs-backend@0.10.2

## 0.20.4

### Patch Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
- Updated dependencies [41a2afb]
  - @giantswarm/backstage-plugin-muster-backend@0.1.0

## 0.20.3

### Patch Changes

- Updated dependencies [3871ed1]
- Updated dependencies [08f6739]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.17.0

## 0.20.2

### Patch Changes

- Updated dependencies [610ead0]
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.6.0
  - @giantswarm/backstage-plugin-gs-backend@0.10.1

## 0.20.1

### Patch Changes

- Updated dependencies [4db80ca]
- Updated dependencies [2a4a2bf]
- Updated dependencies [2a4a2bf]
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.5.0

## 0.20.0

### Minor Changes

- ac09102: Add PagerDuty integration: "Who is on call" entity card, catalog processor that auto-annotates entities with PagerDuty IDs, and MCP action to resolve PagerDuty IDs from catalog entities.

### Patch Changes

- Updated dependencies [ac09102]
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.4.0
  - @giantswarm/backstage-plugin-gs-backend@0.10.0

## 0.19.9

### Patch Changes

- Updated dependencies [b1fcc4f]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.16.0

## 0.19.8

### Patch Changes

- Updated dependencies [9cf3777]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.15.0

## 0.19.7

### Patch Changes

- Updated dependencies [9a27302]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.14.0

## 0.19.6

### Patch Changes

- bf7bc0b: Remove `@terasky/backstage-plugin-catalog-mcp-backend` in favor of the built-in `catalog.query-catalog-entities` action from `@backstage/plugin-mcp-actions-backend`. The built-in action covers all `catalog-mcp.*` use cases via predicate filters, logical operators (`$all`, `$any`, `$not`), value operators (`$in`, `$exists`, `$contains`, `$hasPrefix`), field selection, sorting, and pagination.
- Updated dependencies [e5d4c19]
- Updated dependencies [8c05c63]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.13.0

## 0.19.5

### Patch Changes

- Updated dependencies [c44ac72]
- Updated dependencies [69ab321]
- Updated dependencies [0311382]
- Updated dependencies [3953b15]
- Updated dependencies [3953b15]
- Updated dependencies [42fc0ea]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.12.0

## 0.19.4

### Patch Changes

- 525eedb: Cache-bust custom branding logo URLs by appending the asset's mtime as a `?v=` query string, so replaced logos appear immediately instead of being served stale from the browser cache.

## 0.19.3

### Patch Changes

- a240221: Decouple custom branding from the gs-backend plugin. Branding asset serving moves to a dedicated `branding` backend plugin colocated in `packages/backend/src/branding/`, registered unconditionally so it works in deployments without a `gs:` config block. The frontend hook now resolves assets via the `branding` discovery prefix at `/api/branding/*`.
- Updated dependencies [a240221]
  - @giantswarm/backstage-plugin-gs-backend@0.9.1

## 0.19.2

### Patch Changes

- Updated dependencies [0f6cd54]
  - @giantswarm/backstage-plugin-gs-backend@0.9.0

## 0.19.1

### Patch Changes

- Updated dependencies [9c6edac]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.11.0

## 0.19.0

### Minor Changes

- 52049ca: Update Backstage to 1.50.2.
- 89aa3f2: Add optional guest auth provider, enabled via `ENABLE_GUEST_AUTH` environment variable.
- 89aa3f2: Use custom X-Backstage-Token header for Backstage identity tokens to avoid conflicts with ingress-level Basic auth on the Authorization header.

### Patch Changes

- Updated dependencies [95e2814]
- Updated dependencies [143bd4b]
- Updated dependencies [89aa3f2]
- Updated dependencies [6e73b60]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.10.2
  - @internal/backend-common@0.5.0

## 0.18.4

### Patch Changes

- Updated dependencies [b928d80]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.12.0

## 0.18.3

### Patch Changes

- Updated dependencies [6e25580]
- Updated dependencies [fca7f1a]
- Updated dependencies [7fbbfff]
  - @giantswarm/backstage-plugin-gs-backend@0.8.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.13.1

## 0.18.2

### Patch Changes

- Updated dependencies [7b162b5]
  - @giantswarm/backstage-plugin-gs-backend@0.7.0

## 0.18.1

### Patch Changes

- Updated dependencies [49642b6]
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.3.0

## 0.18.0

### Minor Changes

- 0860ea0: Update Backstage to 1.49.2. Migrate test utilities from @backstage/test-utils to @backstage/frontend-test-utils. Add @backstage/cli-defaults. Fix zod v3/v4 resolution, AiChatFab route crash, and TypeScript issues.

## 0.17.2

### Patch Changes

- Updated dependencies [b3e9dd7]
- Updated dependencies [35dc69b]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.10.0

## 0.17.1

### Patch Changes

- Updated dependencies [38bcb3c]
- Updated dependencies [a1fe62e]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.9.1
  - @giantswarm/backstage-plugin-gs-backend@0.6.0

## 0.17.0

### Minor Changes

- 8d3e632: Add GiantSwarmLocationProcessor to handle "giantswarm" catalog location type, assigning the giantswarm namespace to entities from GS-sourced locations.

### Patch Changes

- Updated dependencies [8d3e632]
- Updated dependencies [93e31f7]
  - @giantswarm/backstage-plugin-catalog-backend-module-gs@0.2.0
  - @giantswarm/backstage-plugin-ai-chat-backend@0.9.0

## 0.16.1

### Patch Changes

- 8fc5501: Fix TechDocs generation failure on Python 3.13 by adding setuptools dependency to the Docker image. The `distutils` module was removed from the Python standard library in 3.12, breaking `mkdocs-monorepo-plugin`.

## 0.16.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- Updated dependencies [d6fda46]
- Updated dependencies [06dc087]
- Updated dependencies [cb36dac]
- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.8.0
  - @internal/backend-common@0.4.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.13.0
  - @giantswarm/backstage-plugin-gs-backend@0.5.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.11.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.10.0

## 0.15.2

### Patch Changes

- Updated dependencies [5850ce3]
- Updated dependencies [cb579b3]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.7.0
  - @giantswarm/backstage-plugin-gs-backend@0.4.0

## 0.15.1

### Patch Changes

- Updated dependencies [8e87dfe]
- Updated dependencies [8e87dfe]
- Updated dependencies [8e87dfe]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.6.0

## 0.15.0

### Minor Changes

- 2efe3a2: Update Backstage from 1.43.3 to 1.47.3. This update includes new features and improvements from Backstage releases 1.44 through 1.47, including Node.js 22/24 support, Jest 30 compatibility, and various plugin updates.

## 0.14.4

### Patch Changes

- Updated dependencies [a68a2b2]
- Updated dependencies [d070c3a]
- Updated dependencies [a68a2b2]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.12.0
  - @giantswarm/backstage-plugin-gs-backend@0.3.2
  - @giantswarm/backstage-plugin-ai-chat-backend@0.5.0

## 0.14.3

### Patch Changes

- Updated dependencies [b32909b]
- Updated dependencies [061ff6d]
- Updated dependencies [b61a7b3]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.4.0

## 0.14.2

### Patch Changes

- Updated dependencies [0384d69]
- Updated dependencies [f81c921]
- Updated dependencies [98f9ffb]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.3.0

## 0.14.1

### Patch Changes

- 53c5d68: Expose additional MCP tools via the catalog MCP backend plugin
- Updated dependencies [24a4c48]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.2.3

## 0.14.0

### Minor Changes

- 1a75706: Add AI Chat plugin.

### Patch Changes

- Updated dependencies [1a75706]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.2.0

## 0.13.1

### Patch Changes

- Updated dependencies [f665c62]
  - @giantswarm/backstage-plugin-gs-backend@0.3.0

## 0.13.0

### Minor Changes

- 7f837a5: Add GS backend plugin.

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-gs-backend@0.2.0

## 0.12.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

## 0.11.1

### Patch Changes

- d7a5609: Fixed helm chart for extraEnvVars

## 0.11.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.11.0
  - @internal/backend-common@0.3.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.10.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.9.0

## 0.10.0

### Minor Changes

- 4c21763: Added a headless backend package to serve auth and scaffolder plugins separately from the main backend instance.

### Patch Changes

- Updated dependencies [4c21763]
  - @internal/backend-common@0.2.0

## 0.9.0

### Minor Changes

- d9eb6f4: Removed custom GitHub auth provider.

## 0.8.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

### Patch Changes

- Updated dependencies [09bae90]
- Updated dependencies [d121c2e]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.10.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.9.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.8.0

## 0.7.5

### Patch Changes

- 910a2fe: Fixed Sentry configuration on backend.

## 0.7.4

### Patch Changes

- 6a11b8c: Added a rule to Sentry configuration to ignore TechDocs warnings.

## 0.7.3

### Patch Changes

- 84ae9db: Moved from custom scaffolder actions to backstage-scaffolder-kubernetes plugin.
- Updated dependencies [84ae9db]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.8.1

## 0.7.2

### Patch Changes

- Updated dependencies [03e8bfc]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.9.0

## 0.7.1

### Patch Changes

- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.8.0

## 0.7.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

### Patch Changes

- Updated dependencies [f42edd2]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.8.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.7.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.7.0

## 0.6.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.7.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.6.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.6.0

## 0.5.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

### Patch Changes

- Updated dependencies [ca553ba]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.6.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.5.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.5.0

## 0.4.3

### Patch Changes

- 0d25e63: Remove undici proxy configuration for Backstage backend.

## 0.4.2

### Patch Changes

- 7f3d6af: Allow to configure HTTP proxy for backend.

## 0.4.1

### Patch Changes

- Updated dependencies [3d05628]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.5.0

## 0.4.0

### Minor Changes

- b833a2b: Add custom root logger service that reports errors to Sentry.

## 0.3.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.4.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.4.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.4.0

## 0.2.0

### Minor Changes

- 06092e9: Change GS auth backend module to support client side OIDC provider.
- f508faf: Update Backstage packages to v1.32.5.

### Patch Changes

- 06092e9: Move custom GitHub auth provider from GS backend module to backend package.
- Updated dependencies [06092e9]
- Updated dependencies [f508faf]
- Updated dependencies [06092e9]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.3.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.3.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.3.0

## 0.1.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.2.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.2.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.2.0
