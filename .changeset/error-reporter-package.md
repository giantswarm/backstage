---
'@giantswarm/backstage-plugin-error-reporter-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'app': patch
---

Extract error reporter API into dedicated package

**New package: `@giantswarm/backstage-plugin-error-reporter-react`**

- Provides `ErrorReporterApi` interface and `errorReporterApiRef` for reporting errors to external services
- Can be used by any plugin that needs to report errors

**Breaking change in `@giantswarm/backstage-plugin-kubernetes-react`**

- Removed `errorReporterApiRef` export (now in `@giantswarm/backstage-plugin-error-reporter-react`)
- Error reporter is now optional: if not registered, only console logging occurs
- API version issues are now always logged to console in addition to error reporter

**Changes in `app`**

- Removed `ErrorReporterProvider` React context wrapper
- Error reporter is now registered as a standard Backstage API via `createApiFactory`
- Simplified implementation by merging `SentryErrorNotifier` into `SentryErrorReporter`
