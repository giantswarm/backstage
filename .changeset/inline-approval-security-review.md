---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

The inline approval card shows everything muster's view and the decision's digest cover: every value in full (long ones collapsed behind _Show all_, never cut), workflow step arguments, and the asking agent, caller kind, person, session and client under "About this request". Approve and Decline come after the request, stay inert until they have been in view for a second, and Approve waits until every collapsed value was opened. Each approval link gets its own card. The card warns whenever muster does not positively name the conversation's agent. The muster backend sends the portal's own workload token (`X-Muster-Approval-Client`, read from `muster.workloadTokenFile`) with inline decisions and sign-in handoff requests, as muster now requires.
