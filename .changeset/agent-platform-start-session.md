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

`start_session` creates the session **and sends its first message**, so the
session page and the assist panel no longer send the prompt themselves: they
show it as the first message, working, until the conversation's first read
has it, and follow the first turn through the poll. The idempotency key per
submission and the derived title are unchanged; a retried submission answers
the session the first attempt started.

The backend's `POST /kagent/sessions` route and `KagentClient.createSession`
are removed, with the frontend's `KagentApi.createSession` and the common
package's `parseCreatedSessionId`. Reads, sends, rename and delete stay on the
kagent proxy. Requires agent-manager 1.12.0 or later on the installation.
