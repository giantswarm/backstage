---
'@giantswarm/backstage-plugin-gs': minor
---

Show the build verdict and the declared build toolchain in the component
catalog.

- **"Build" column** — `BuildStatusProcessor`'s verdict, failing first, with the
  confirmed failing checks on hover. Gated on any entity carrying the label, so
  it is absent where the processor is off.
- **"Build toolchain" column** — the architect orb version the default branch
  declares, as the catalog importer publishes it, with the app-build-suite and
  app-test-suite versions that orb pins on hover. Sorts newest orb first; a pin
  that is not a release (`dev:…`, `volatile`) shows its raw ref and sorts last.
- **Sidebar pickers** for build status and architect orb version. The orb picker
  orders by semver rather than by a fixed option list, so `EntityCheckboxesPicker`
  gains an optional `compareOptions` comparator for open-ended value sets.
- **Readiness card gains a "Build" section** — the verdict, the failing checks and
  the toolchain, worded as _declared on `<default branch>`_: it is read from the
  CircleCI config, not from the last build, so an orb bump that landed after the
  last successful build is already reflected there.

`partitionReadinessFlags` now returns three buckets — `release`, `build`,
`chartMetadata` — so `BUILD-RED` is never listed under "Blocking the release"
or under the chart-metadata "Fails a build today".
