---
'@giantswarm/backstage-plugin-muster': patch
---

The Connectors list no longer crashes when two organizations each own a connector of the same name: each is its own row, with its own state, tools and sign-in. A connector is identified by muster's key for it, `<namespace>/<name>` for an organization's, in the list, its tools (`x_<namespace>_<name>_…`), its usage and the Workflows page. While another connector shares its name, an organization's connector has no page link, as its name alone does not tell their pages apart; muster's own connector of that name keeps the page.
