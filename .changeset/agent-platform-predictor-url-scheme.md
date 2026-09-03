---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Wire served models to their predictor over `http` even when KServe publishes
an `https` in-cluster address.

In raw-deployment mode the KServe controller writes `status.address.url` with
the ingress `urlScheme`, so a TLS-terminated installation reports
`https://<name>-predictor.<ns>.svc.cluster.local` although the predictor
Service speaks plain HTTP on port 80. `InferenceService.getInternalUrl()` — and
with it the Serving section's endpoint and the `baseUrl` of the ModelConfig the
serve flow auto-creates — inherited that scheme and pointed agents at a TLS
port that does not exist. Cluster-local hosts without an explicit port now get
`http`; external hosts and explicit ports are kept.
