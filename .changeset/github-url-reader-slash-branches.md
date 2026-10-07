---
'backend': patch
'backend-headless-service': patch
'@internal/backend-common': minor
---

The backend reads GitHub files and trees from branches whose name contains a slash, such as a scaffolder template at `https://github.com/<org>/<repo>/blob/feat/x/templates/t/template.yaml`. The default GitHub URL reader took `feat` for the branch and `x/templates/...` for the path, so the read failed with not found. `@internal/backend-common` exports `githubUrlReaderFactory`, which resolves the longest branch the path starts with through the GitHub API and reads its head commit; files found by a search keep the branch in their URL.
