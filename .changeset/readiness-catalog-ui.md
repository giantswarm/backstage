---
'@giantswarm/backstage-plugin-gs': minor
---

Show release readiness in the component catalog, from the
`giantswarm.io/readiness` label `AppReadinessProcessor` writes and the
chart-metadata verdict `backstage-catalog-importer` publishes.

- A sortable **Release readiness** column, blocked first — sorting a health
  column should surface what needs attention. Each verdict has a distinct icon
  silhouette via `StatusLabel`, so it survives greyscale, and the hover names the
  release blockers or, where there are none, explains what the verdict means.
  `unknown` is the verdict a reader can least interpret unaided, so it never
  renders as a bare chip.
- A sidebar filter (`EntityReadinessPicker`), a thin wrapper around the existing
  generic `EntityCheckboxesPicker`, keying on the label because the catalog API
  only filters server-side on labels.
- A per-component card (`EntityAppReadinessCard`) that keeps three claims apart:
  the release verdict, the chart-metadata verdict
  (`giantswarm.io/readiness-standards`), and advisory gaps. Both verdicts write
  to `giantswarm.io/readiness-flags`, so the card splits that list back apart by
  the flag that owns it — **Blocking the release** versus **Fails a build
  today** — rather than listing them under one claim. Advisory gaps are
  documented in the chart metadata standard but gated nowhere, and four charts in
  five carry at least one, so they sit under **Not enforced** in neutral styling:
  showing them as failures would turn a rollout nobody has run into hundreds of
  broken apps. Each flag carries an explanation in the reader's terms, naming the
  file and the app-build-suite rule that gates it.
- The card appears wherever there is readiness data from either source, since the
  importer publishes for every component today while the processor ships
  disabled; the column needs the release verdict specifically. The card titles
  itself "Readiness" rather than "Release readiness" when it holds no release
  verdict.
- New `components/utils/readiness.ts` owns how verdicts are presented — labels,
  intents, meanings, the verdict order, and the release-flag partition — so the
  column, the card and the picker cannot disagree about a verdict's label or its
  place in the order. The release blocker names come from
  `@giantswarm/backstage-plugin-gs-common`, so the processor and the devportal
  cannot disagree about which half of `readiness-flags` a flag belongs to.
