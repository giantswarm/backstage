---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`@giantswarm/k8s-types` moves to v0.10.0: the kagent API v2 types
(`kagent.dev/v1alpha3`) come from the kagent line's release v1.2.5, the line
the Agent Platform runs; bounded arrays are plain arrays instead of tuple
unions, which shrinks the AgentTemplate types from 395 KB to 13 KB; and every
API group version is an entry point of its own (`@giantswarm/k8s-types/crds/<group>/<version>`).
