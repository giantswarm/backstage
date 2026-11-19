---
'@giantswarm/backstage-plugin-ui-react': minor
---

`RouteTabs` hands a tab switch to its `onNavigate` guard through the routing integration of `@backstage/frontend-plugin-api/routing`, which Backstage UI's tabs navigate with from Backstage 1.57. `testUtils` adds `BUIRouterProvider`, which gives Backstage UI components rendered outside a test app the routing of the test's `MemoryRouter`.
