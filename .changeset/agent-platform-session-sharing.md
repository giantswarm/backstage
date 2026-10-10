---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Add backend routes for session sharing. The backend proxies kagent's three
share RPCs through the existing kagent routes, as the signed-in person
(`GET`/`POST /kagent/sessions/:sessionId/shares`, `DELETE …/shares/:shareId`),
with the create's answer marked `no-store` since it carries the only copy of
the token.

What a share **is** on this kagent line: a token granting A2A access to the
session — read-only (get, list, subscribe) or read & write (also send and
cancel) — until it expires or is revoked. The controller stores only a hash of
the token, so the create's answer is the only place it ever exists.

**No UI yet, deliberately.** The pinned kagent API surface has
`CreateSessionShare`/`ListSessionShares`/`RevokeSessionShare` but no
resolve-by-token operation, so this portal cannot open a session from a share
token — a shared-session view (and with it the share dialog) waits until the
controller grows a resolve API. The routes are in place for kagent-compatible
clients and for that future UI.
