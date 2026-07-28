---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Add a "Sessions" tab to the Agent Platform section
(`/agent-platform/sessions`), listing the signed-in user's kagent chat sessions
across the fleet.

- Read-only bui table — Session, Agent (display name + avatar), Installation,
  Started, Last activity — with client-side search across title, agent and
  installation, sortable columns, and pagination. Timestamps render as relative
  dates via `ui-react`'s `DateComponent`, with a dash where kagent reports none.
- Agent names and avatars are resolved by matching kagent's `agent_id` against the
  `Agent` CRs the plugin already loads. The match is done on the **encode** side
  (`ns/name` → `ns__NS__name` with `-` → `_`), because kagent's encoding is
  lossless while decoding is not; a decoded label is only a display fallback, and
  a genuine encode collision resolves deterministically.
- **Fleet-aware**, like the Agents tab: reachable installations are narrowed
  first, then intersected with the backend's kagent allowlist — and the session
  queries **wait** for that allowlist, since kagent runs on only a couple of
  installations and querying the rest would fire a doomed request per
  installation, each minting that installation's Dex token first. One cached call
  is cheaper than N wasted ones. If the allowlist itself fails we fall back to the
  reachable set, so a backend hiccup doesn't look like an empty list.
- Each installation loads independently: rows appear as soon as the first
  installation answers, further loading shows as a thin bar rather than blanking
  the table, and `404`/`503` ("kagent isn't deployed here" — the common case
  fleet-wide) stays silent while anything else is surfaced.
- Warns when an installation's kagent is **not scoped to the signed-in user**
  (`unsecure` auth mode resolves every caller to a shared built-in user, so the
  list would silently not be the user's own). Only an explicit negative triggers
  the warning: an unresolved or subject-less probe means "unknown" and stays
  quiet, so a healthy installation whose IdP omits `sub` isn't flagged.
- Reports as its own page in telemetry, ahead of the generic `/agent-platform`
  cases which would otherwise label it "Agents".

Scope is deliberately reduced against the prototype: a kagent `Session` has 7
fields, so status, trigger, duration, cost, tokens, team, linked task, results and
evaluation — plus the summary stat band derived from them — have no backing data.
kagent also lists sessions with `WHERE user_id = <sub>` and exposes no cross-user
endpoint, so the prototype's Mine/Watched/All scopes reduce to one implicit scope.
Session detail, delete and rename are deferred.
