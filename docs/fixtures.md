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
2. Fixture modules are named `*FixtureApi.ts` or `*Fixtures.ts`, or live in a
   `fixtures/` or `__fixtures__/` directory. Nothing imports them statically
   but tests, stories and other fixture modules: the lint rule
   `giantswarm/no-fixture-imports` (`.eslintrc.js`) fails on such an import
   anywhere else, the `apis` barrel included.
3. The API factory checks `process.env.NODE_ENV !== 'production'` before the
   config flag, in the factory itself, not in a helper. The bundler replaces
   `process.env.NODE_ENV` with a constant, so in a production build the branch
   is dead and dropped, with the `import()` inside it: the fixture chunk is
   never emitted.
4. API factories are synchronous, so the factory returns `lazyApi` from
   `@giantswarm/backstage-plugin-ui-react`, which loads the implementation with
   the dynamic `import()` on its first call. Every member of the API must be a
   required method returning a promise; the type of `lazyApi` refuses
   anything else. The wrapper answers each method name with one stable
   function, and behaves like a plain object otherwise (`String`,
   `JSON.stringify`, `await`, Jest's equality).
5. Add a string that only the fixture code contains, with its source file, to
   `MARKERS` in `scripts/check-bundle-fixtures.mjs`.
6. Document the flag in the plugin's `config.d.ts`, saying it has no effect in
   a production build.

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

## The checks

The lint rule catches the static import, the usual way fixture code leaks. The
bundle check is the backstop for the rest, such as a factory whose branch the
bundler could not drop: the `node-build` job builds the app for production and
then runs `yarn ci:bundle-fixtures` (`scripts/check-bundle-fixtures.mjs`),
which fails when any built file under `packages/app/dist` contains one of the
markers. It also fails when a marker's source file no longer contains it, so a
reworded fixture cannot disable the check unnoticed. To run it locally:

```bash
NODE_ENV=production yarn workspace app build --config ../../app-config.yaml
yarn ci:bundle-fixtures
```
