---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Read SecretStores and ClusterSecretStores as `external-secrets.io/v1`. External
Secrets Operator stopped serving `v1beta1` in v0.17.0, so the scaffolder's
secret store picker found no stores on management clusters.
