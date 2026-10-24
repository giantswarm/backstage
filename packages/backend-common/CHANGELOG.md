# @internal/backend-common

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
