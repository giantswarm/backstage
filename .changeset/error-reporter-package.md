---
'@giantswarm/backstage-plugin-error-reporter-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': patch
'app': patch
---

Create dedicated error-reporter-react package

- Add new `@giantswarm/backstage-plugin-error-reporter-react` package with `ErrorReporterApi` interface and `errorReporterApiRef`
- Update kubernetes-react to use optional error reporter via `useApiHolder()`
- Log API version issues to console in addition to error reporter
