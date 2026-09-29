---
'@giantswarm/backstage-plugin-gs-node': patch
---

The muster MCP client survives a lost MCP session. A stateful streamable-http
server (agentgateway's MCP proxy in front of muster) forgets a session that was
idle for its TTL, or that lived on a replica that was rolled, and answers 404
for the id; the SDK's http transport then clears its id without closing, and
every later request went out without a session id and was answered 400
`session header is required for non-initialize requests` until the cache's
30-minute sweep.

- A lost session (404 `session not found`, 400 `session header is required`,
  the transport's `onSessionExpired` hook, a closed client) marks the cached
  client dead; the failed tool call runs once more on a fresh client (a new
  `initialize`), transparently. Such a request was rejected before it reached
  the tool, so the retry is safe even for a mutation.
- The cache recreates a client idle for more than ten minutes (below the
  gateway's 30-minute idle TTL), so a person coming back to a page is not
  handed a client whose session the gateway has forgotten.
- Transport failures reach the caller in plain words
  (`<installation> did not answer: <reason>`); the SDK's transport text goes
  to the log. A transport 401 passes through unchanged for the sign-in path.
