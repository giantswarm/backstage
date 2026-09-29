---
'@giantswarm/backstage-plugin-muster': minor
---

MCP servers page: muster's `Awaiting Session` state (a server used with each person's own identity through token forwarding or exchange, with no session connected) renders as a healthy state, on the server rows, the family cluster pills, the dashboard's servers-healthy stat and the detail view alike. The state badge and the cluster pills carry muster's `Ready` condition message as their tooltip, and the Health block shows it as a row, so the page says how a per-session server is reached, when its token exchange last worked, or which part of a broken exchange fails (`TokenExchangeCredentials`, `TokenExchangeEndpoint`, `TokenExchangeConnector`) without leaving it. The empty-tools note for such a server names the per-session mechanism instead of pointing at a Sign in that does not exist, a `Failed` server's note carries muster's own sentence, and the new-server verify step treats `Awaiting Session` as verified.
