---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
---

Tool calls that report progress: `MusterApi.callToolWithProgress` hands each `notifications/progress` to `onProgress` as it arrives and rejects with `MusterAnswerCutError` when the answer ends before its result. muster-backend serves it on `POST /call/progress` as newline-delimited JSON (`progress` lines, then one `result` or `error` line); a caller that goes away cancels the call. gs-node's `MusterMcpClient.callToolWithProgress` runs the call on the official MCP SDK (`@modelcontextprotocol/sdk` 1.32.1), restarting its wait on every notification, up to 65 minutes.
