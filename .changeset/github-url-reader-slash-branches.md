---
'backend': patch
'backend-headless-service': patch
'@internal/backend-common': minor
---

The backend reads GitHub files and trees from branches and tags whose name contains a slash, such as a scaffolder template at `https://github.com/<org>/<repo>/blob/feat/x/templates/t/template.yaml`. The default GitHub URL reader took `feat` for the branch and `x/templates/...` for the path, so the read failed with not found. `@internal/backend-common` exports `githubUrlReaderFactory`. It reads every URL as before and only when that finds nothing looks up the longest branch, else tag, that the path starts with, and reads its commit; files found by a search keep the ref in their URL.
