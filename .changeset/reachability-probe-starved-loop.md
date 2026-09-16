---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

Reachability probes (muster's `/installations`, agent-platform's `/kagent/installations`): a probe that ran out of its 3 s budget while the backend's event loop was busy for most of that window -- a pod initialising every plugin at once under a CPU quota -- no longer records the installation as "not reachable from this portal", an answer the backend then served for five minutes and the browser kept for an hour. Such a timeout says nothing about the endpoint (the same endpoint answers the same process in well under a second once it is idle): it is now reported _inconclusive_, nothing is cached, and the next read probes again -- which both frontends do every few seconds while an installation is `'unknown'`. The warm-up moved from plugin initialisation to the backend's startup hook, a negative answer is re-probed after 30 s instead of 5 min, and the gRPC probe closes its HTTP/2 session instead of leaving one idle for 15 minutes per probe.
