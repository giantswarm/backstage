---
'backend': minor
---

The backend exports OpenTelemetry traces over OTLP. `packages/backend/src/instrumentation.js`, loaded with `node --require` ahead of the backend (the image's command and `yarn start`), starts the OpenTelemetry Node SDK with the auto-instrumentations (HTTP, Express, undici, pg, Knex and the rest, without `fs`, `dns` and `net`) when an OTEL_* variable names an exporter: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OTEL_TRACES_EXPORTER`. Every setting is a standard OTEL_* variable; `service.name` defaults to `backstage`, and metrics and logs stay off unless their own variable is set. Without any of them the SDK is not loaded.
