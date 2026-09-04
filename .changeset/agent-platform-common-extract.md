---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Extract the kagent wire layer into a new `agent-platform-common` package. No
behaviour change — every module moves verbatim, with its tests and fixtures.

Moved out of `agent-platform/src/lib`: `kagentSchema`, `kagentTaskSchema`,
`kagentSessions`, `kagentSessionDetail` and `kagentSessionState`, plus
`isListableSession`, which had been sitting in the sessions table's helpers.

**Why now.** The backend is about to derive a session's state server-side, which
needs the task schema, the session parsers and the state map. A second copy in
the backend is exactly the drift the version-tolerance strategy exists to
prevent: kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on
v0.10.x, and the fleet can run a mix, so tolerance lives in permissive parsing
rather than version detection — and that only holds while there is one parser
and one `KNOWN_STATES`. The first symptom of two would be a session grouped one
way in a list and badged another way on its own page.

`kagentSessionPolling` stays in the frontend: it is typed against react-query.
It keeps re-exporting `ACTIVE_MAX_AGE_MS`, so its callers are untouched.

**Fixtures are shared, not duplicated**, through a dedicated `/testFixtures`
entry point. A test asserting against its own copy of a captured v0.9.9 response
is one that can keep passing while the real fixture drifts. Two constraints
shaped that entry point rather than a deep import: `no-forbidden-package-imports`
rejects reaching into another package's `src`, and the type rollup cannot resolve
a `.json` module, so each fixture carries an explicit type instead of the one
inferred from its JSON. The six well-formed task envelopes are typed as a mutable
`TaskEnvelopeFixture`, since tests clone and edit them to reach states no
captured response covers; the malformed and envelope-tolerance ones are
`unknown`, which is what a parser sees anyway.
