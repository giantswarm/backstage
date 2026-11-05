---
'@giantswarm/backstage-plugin-gs': minor
---

Make the cluster "Gateways" tab easier to scan on busy clusters.

- One row per Gateway, with its listeners listed in the row.
- Search HTTPRoutes by name, namespace, hostname or parent.
- Concrete hostnames link to the site; wildcards stay plain text.
- The tab is hidden on installations without Mimir, since everything on it
  comes from metrics.
- If the Gateway API topology cannot be loaded, the Envoy Gateway policies
  are still shown.
