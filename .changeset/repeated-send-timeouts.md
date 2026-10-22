---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

A session whose messages keep timing out before the agent starts, with none of
them reaching the session, now offers to continue in a new session from the
second such send in a row. The notice reads "This session may not be able to
continue" and keeps the message box and the retry, since kagent has not marked
the runtime lost. A send that lands, or a new turn, ends the count; a loss
kagent reports later takes the reported path. `agent-platform-common` adds
`countSendTimeout`, `readSendTimeoutRuntimeLoss` and `RuntimeLoss.source`.
