---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Tabs with a count no longer change width when the count arrives, so the tabs
to their right stop moving under the pointer. `RouteTabs` (and `ShellPage`'s
`tabs`) take `count: 'loading'`, drawn as a skeleton as wide as a two-digit
count, and a loaded count always reserves two digits' width. Customize's tabs
and Connectors sub-tabs, a connector's Tools tab and a skill's Used by tab pass
it while their data loads. `RouteTabCount` is exported; the Customize count
types (`CustomizeCounts`, `MusterCustomizeCounts`) now say `'loading'` instead
of leaving a loading count out.
