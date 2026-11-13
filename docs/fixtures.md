# Fixture modes

A fixture mode swaps a plugin's frontend API for an in-memory implementation,
so its pages render made-up data without their backends: for local
development, design reviews and layout checks. Fixture code never ships in a
production build.

| Flag                     | Plugin                       | Fixture implementation                                                               |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------ |
| `plans.fixtures: true`   | plans (Hive, the plan list)  | `plugins/plans/src/apis/PlansFixtureApi.ts`, `plugins/plans/src/lib/hiveFixtures.ts` |
| `roadmap.fixtures: true` | roadmap (Hive's Roadmap tab) | `plugins/roadmap/src/apis/RoadmapFixtureApi.ts`                                      |

Set the flags in `app-config.local.yaml` and run `yarn start`. In a production
build (`NODE_ENV=production`, what `backstage-cli package build` and the image
use) the flags have no effect.

## Adding a fixture mode

The pattern keeps the fixture code out of the production bundle, fixed at build
time rather than by config:

1. The fixture class implements the plugin's API interface, so a change to the
   interface breaks its build.
2. Nothing imports the fixture module statically: not the plugin, not the
   `apis` barrel. Tests may.
3. The API factory checks `process.env.NODE_ENV !== 'production'` before the
   config flag, in the factory itself. The bundler replaces
   `process.env.NODE_ENV` with a constant, so in a production build the branch
   is dead and dropped, with the `import()` inside it: the fixture chunk is
   never emitted.
4. API factories are synchronous, so the factory returns `lazyApi` from
   `@giantswarm/backstage-plugin-ui-react`, which loads the implementation with
   the dynamic `import()` on its first call. Every member of the API must be a
   method returning a promise; the type of `lazyApi` enforces it.
5. Add a string that only the fixture code contains to `MARKERS` in
   `scripts/check-bundle-fixtures.mjs`.

```ts
factory: ({ configApi, discoveryApi, fetchApi }) => {
  if (
    process.env.NODE_ENV !== 'production' &&
    configApi.getOptionalBoolean('example.fixtures')
  ) {
    return lazyApi(async () => {
      const { ExampleFixtureApi } = await import('./apis/ExampleFixtureApi');
      return new ExampleFixtureApi();
    });
  }
  return new ExampleApiClient({ discoveryApi, fetchApi });
},
```

A unit test of the factory (`plugins/plans/src/plugin.test.ts`) covers both
sides: with the flag it serves fixture data, and with `NODE_ENV` set to
`production` it returns the real client.

## The CI check

The `node-build` job builds the app for production and then runs
`yarn ci:bundle-fixtures` (`scripts/check-bundle-fixtures.mjs`), which fails
when any built file under `packages/app/dist` contains one of the markers. To
run it locally:

```bash
NODE_ENV=production yarn workspace app build --config ../../app-config.yaml
yarn ci:bundle-fixtures
```
