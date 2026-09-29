---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
'@giantswarm/backstage-plugin-gs': patch
---

Cluster access: a token broker that answers 503 (`temporarily_unavailable`, `service_unavailable` or an empty body) is reported as `broker_unavailable` -- "Token broker is briefly unavailable" in the cluster-access status -- and logged as `Cluster token exchange failed: token broker temporarily unavailable`, apart from the broker's genuine rejections (`exchange_failed`). A broker outage hits every installation at once and clears by itself; it was reported as a rejected exchange for each of them.
