---
'@giantswarm/backstage-plugin-gs': minor
---

Make the cluster "Gateways" tab easier to scan on busy clusters.

- One row per Gateway, with its listeners listed in the row.
- Search HTTPRoutes by name, namespace, hostname or parent.
- Concrete hostnames link to the site; wildcards stay plain text.
- The tab is hidden on installations without Mimir, since everything on it
  comes from metrics.
- The Gateway API topology loads with one Mimir query instead of nine. A
  failed first load now hides the Gateways and HTTPRoutes tables together
  instead of only the conditions; a failed refetch keeps the last result.
