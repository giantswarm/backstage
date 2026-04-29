---
'@giantswarm/backstage-plugin-gs': patch
'app': patch
---

Replace the `fa fa-kubernetes` Font Awesome icon in `KubernetesVersion` with an inline `KubernetesIcon` SVG component, and remove the now-unused Font Awesome kit integration (script tag, `faIcon` helper, and `use.fortawesome.com` CSP entry).
