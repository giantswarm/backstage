---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Add session sharing. The session page's header gains a share icon beside the
cost chip (hidden on a session that itself arrived shared read-only) opening a
dialog that mints a share token, lists the session's active shares and revokes
them.

What a share **is** on this kagent line: a token granting A2A access to the
session — read-only (get, list, subscribe) or read & write (also send and
cancel) — until it expires or is revoked. The dialog offers 1 hour, 24 hours,
7 days (default: 24 hours) or the installation's own default lifetime, which
the controller applies when no TTL is sent. The controller stores only a hash
of the token, so it is shown exactly once, in the create's answer, with a copy
button; the list of existing shares can only revoke.

**Deliberately not built: a shared-session view.** The pinned kagent API
surface has `CreateSessionShare`/`ListSessionShares`/`RevokeSessionShare` but
no resolve-by-token operation, so this portal cannot open a session from a
share token — the dialog says so, and the token is for kagent-compatible
clients. A portal route for opening shares needs a resolve API on the
controller first.

The backend proxies the three RPCs through the existing kagent routes, as the
signed-in person (`GET`/`POST /kagent/sessions/:sessionId/shares`,
`DELETE …/shares/:shareId`), with the create's answer marked `no-store` since
it carries the only copy of the token. The share list is never persisted to
localStorage (`session-shares` joins the user-scoped cache keys). A new
tracked event `AgentPlatform.sessionShared` reports a created share with its
permission and TTL choice; revoking is untracked housekeeping.
