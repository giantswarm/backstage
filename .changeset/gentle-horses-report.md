---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Move Sentry API version issue reporting into useResource and useResources hooks

- Add automatic `useReportApiVersionIssues` call inside `useResource` and `useResources` hooks
- Expose `clientOutdated` from `useResource` return value for consistency
- Developers no longer need to manually call `useReportApiVersionIssues` when using these hooks
