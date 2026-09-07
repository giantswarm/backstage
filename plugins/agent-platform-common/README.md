# @giantswarm/backstage-plugin-agent-platform-common

Shared kagent wire handling for the Agent Platform plugins: the permissive zod
schemas for kagent's session and A2A task payloads, the normalizers that turn
them into domain types, and the session-state semantics derived from a session's
newest task.

## Why this package exists

kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on v0.10.x, and the
fleet can run a mix — so version tolerance lives in permissive parsing rather than
version detection. That strategy only holds while there is exactly **one** parser
and **one** state map.

Both the frontend plugin and the backend need them: the frontend to render a
session's state badge and timeline, the backend to derive the same state
server-side for the session switcher rail (fanning out over task reads too large
to do in the browser). A second copy would drift, and the first symptom would be
the rail disagreeing with the badge on the page it is attached to.

Consumers:

- `@giantswarm/backstage-plugin-agent-platform`
- `@giantswarm/backstage-plugin-agent-platform-backend`
