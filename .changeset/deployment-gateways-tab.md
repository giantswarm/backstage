---
'@giantswarm/backstage-plugin-gs': minor
---

Add a "Gateways" tab to the deployment detail page listing the hostnames
exposed via Gateway API HTTPRoutes, together with their serving TLS
certificates.

- New tab shows a table of hostnames (from the
  `gatewayapi_httproute_hostname_info` metric, scoped to the workload's target
  namespace), each linking to `https://<hostname>/`.
- Each row resolves its serving certificate by walking the Gateway API chain
  (HTTPRoute → parentRef → Gateway listener → cert-manager Certificate, matched
  by the conventional `gateway-<gateway>-<listener>` name) and shows readiness
  and expiry, color-coded by severity. Issuer, certificate name/namespace and
  the matched host pattern are available behind an info tooltip.
- The deployment "About" card now shows the workload's target namespace when it
  differs from the HelmRelease/App namespace.
