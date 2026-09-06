---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

A first call through muster for a person who never consented to the server
is refused by muster's aggregator with `failed to connect to server <name>:
user not authenticated to server <name>`. The shared gateway's not-connected
detection (`looksNotConnected`, used by `asConnected`) did not recognise that
answer, so the plans and roadmap backends returned it as a `500` instead of
the `401 MusterServerNotConnectedError` that makes the frontends offer the
"Connect GitHub" step. It is recognised now: the backend asks muster to
connect the session (a person who consented before reconnects silently and
the call is retried), and only a missing consent surfaces as the 401 with
muster's sign-in URL.
