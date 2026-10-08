---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

`GET /kagent/session-states` answers in candidate order (newest session first) instead of the order the task reads happened to finish in, so two evaluations of the same account answer alike.
