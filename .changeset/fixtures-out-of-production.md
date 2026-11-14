---
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-roadmap': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

`plans.fixtures` and `roadmap.fixtures` take effect outside production builds only: a production build of the app contains no fixture code, and setting the flag on an instance no longer shows made-up data. Outside production the fixture APIs load with a dynamic `import()` on their first call. `ui-react` exports `lazyApi`, which wraps such an API implementation for a synchronous API factory.
