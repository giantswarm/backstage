---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-flux-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Replace SelectedResourceDrawer with shared DetailsPane component from ui-react. Add prefix support and open() method to useDetailsPane hook. Rename installationName to cluster in DetailsPane params.
