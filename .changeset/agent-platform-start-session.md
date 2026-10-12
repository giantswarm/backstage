---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

Every session starts through agent-manager's `start_session`, called through
muster as the signed-in person (`AgentManagerClient.startSession`), on every
entry point: the sessions list, the agent page, the session page, the command
palette, the meta-agent hand-offs and the create-agent assist. It is the one
place where an agent and, optionally, a workspace grant meet, so no surface
can skip a workspace's access check. The portal sends no grant yet: an absent
grant is the plain session.

The portal calls `start_session` without a message, so it only creates the
session; the session page still sends the first message itself, streamed and
with the human-in-the-loop extension requested, as every reply. The
idempotency key per submission and the derived title are unchanged.

The backend's `POST /kagent/sessions` route and `KagentClient.createSession`
are removed, with the frontend's `KagentApi.createSession` and the common
package's `parseCreatedSessionId`. Reads, sends, rename and delete stay on the
kagent proxy. Requires an agent-manager whose `start_session` takes an
optional message on the installation.
