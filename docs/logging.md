# Logging and error reporting

The backend root logger forwards **every `warn` and `error` log to Sentry**
(winston Sentry transport at `level: 'warn'` in
`packages/backend-common/src/rootLogger.ts`). Pick log levels by whether a human
should act, not by how bad it sounds:

- `logger.error` / `logger.warn`: a real, actionable fault (a dependency is
  down, a credential is invalid, an invariant broke). These become Sentry issues.
- `logger.info` / `logger.debug`: expected, already-handled outcomes, even when a
  request "fails": an upstream 4xx you translate into a clean response, an expired
  user token, a retry that will recover. Logging these at `warn` floods Sentry.

If a failure is handled gracefully (you return a structured error to the caller
and no user is impacted), it is `info`/`debug`, not `warn`. Keep high-cardinality
values (installation name, entity id, raw response bodies) out of the _message_
of a `warn`/`error`: Sentry fingerprints on the message, so one root cause fans
out into one issue per value. Put those in structured metadata instead.

Frontend equivalent: `SentryErrorReporter`
(`packages/app/src/apis/errorReporter/`); `warning`-level `notify()` calls also
reach Sentry.

Triage of what arrives in Sentry: the `sentry-triage` skill.
