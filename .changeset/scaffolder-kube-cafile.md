---
'@giantswarm/backstage-plugin-scaffolder-backend-module-gs': patch
---

`kube:apply` now honors `caFile` on clusters declared under
`kubernetes.clusterLocatorMethods`. The factory previously read only `caData`,
so a cluster configured with `caFile` (the standard way to point at the mounted
service-account CA, `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`, and
what the agent-platform-standalone chart generates) produced a client with no
CA at all. Node then fell back to its bundled trust store and every request
failed with `unable to verify the first certificate` — surfacing in the agent
creation flow as "Failed to fetch resource metadata for
source.toolkit.fluxcd.io/v1/OCIRepository". `@kubernetes/client-node` resolves
`caFile` natively, so the value is passed straight through.
