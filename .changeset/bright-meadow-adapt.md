---
'@giantswarm/backstage-plugin-gs': patch
---

Replace SelectFormField with Autocomplete in ClusterPicker and InstallationPicker for consistent UX. Use TextField helperText prop in ChartPicker instead of separate FormHelperText. Clear dependent scaffolder fields (ChartPicker, ChartTagPicker) when parent entity is cleared, preventing stale values from persisting.
