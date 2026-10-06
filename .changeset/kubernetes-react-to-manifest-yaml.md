---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add `toManifestYaml`, which serializes a Kubernetes object as YAML in `kubectl get -o yaml` key order, without `managedFields` or the `last-applied-configuration` annotation, and without folding long values.
