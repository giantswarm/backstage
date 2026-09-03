---
'@giantswarm/backstage-plugin-scaffolder-backend-module-gs': minor
'backend': patch
'backend-headless-service': patch
---

Replace the `@devangelista/backstage-scaffolder-kubernetes` and
`@aws/aws-core-plugin-for-backstage-scaffolder-actions` scaffolder plugins with
an in-repo `kube:apply` action in the GS scaffolder backend module.

- `kube:apply` keeps the exact action ID and input schema
  (`manifest`, `namespaced`, `clusterName`, `token`), so existing templates —
  including the hidden `agent-deployment` template driven by the Agent Platform
  create flow — keep working unchanged. It resolves clusters from
  `kubernetes.clusterLocatorMethods` (type `config`) the same way as before:
  OIDC clusters use the per-task user token, `serviceAccount` clusters their
  static token, with a fallback to the default kubeconfig.
- The other actions from those plugins (`kube:delete`, `kube:job:wait`,
  `aws:cloudcontrol:create`, `aws:codecommit:publish`, `aws:eventbridge:event`,
  `aws:s3:cp`) have no usage in any template and are dropped.
- The devangelista plugin pinned old `@backstage/*` and
  `@kubernetes/client-node` ranges, nesting ~185MB of duplicate dependencies
  (including the deprecated `@backstage/backend-common`, which is now gone
  entirely); the AWS plugin nested another ~80MB of duplicate `@aws-sdk`
  clients. Together with a `yarn dedupe`, `node_modules` shrinks by roughly
  850MB, most of which was shipped in the backend image.
