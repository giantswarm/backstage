---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': patch
---

Fall back to PAT or unauthenticated requests when the configured GitHub App has no access to a repo. Previously `LatestReleaseProcessor` and `SbomDependencyProcessor` failed with "No GitHub credentials" / "App does not have access to repository" for any repo not in the App's installation. They now try the credentials provider first, fall back to the integration's `token:` (PAT) when it throws or returns no token, and finally fall back to unauthenticated requests so public repos still work without any integration configured.
