---
'app': minor
---

Pin the public frontend config: `frontendVisibility.test.ts` enumerates every
frontend-visible path of the app's merged config schema and compares it with
the committed `frontendVisiblePaths.golden.json`, so a new field, plugin or
dependency bump that widens what the unauthenticated `index.html` carries
fails CI until the golden file is regenerated and the diff reviewed. The same
test refuses `@deepVisibility frontend` in every `config.d.ts` of the
repository; the app's own schema annotates the theme colors, the Sentry and
the TelemetryDeck fields one by one instead.
