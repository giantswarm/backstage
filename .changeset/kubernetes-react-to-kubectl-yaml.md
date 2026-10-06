---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add `toKubectlYaml`, which serializes a Kubernetes object as YAML the way `kubectl get -o yaml` prints it (keys sorted alphabetically at every level), without `managedFields` or the `last-applied-configuration` annotation, and without folding long values.
