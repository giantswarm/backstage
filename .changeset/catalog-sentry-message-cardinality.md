---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': patch
---

Stop transient catalog failures from filling Sentry.

The root logger forwards every `warn` to Sentry, and Sentry fingerprints on the
log message — so a chart name, entity ref or URL in the _message_ turns one
fault into one issue per value. Two places here did that, and between them
accounted for roughly 65 open issues across the customer backends and
devportal-backend for what is really two transient upstream faults.

`LatestOciReleaseProcessor` logged every failed tag fetch at `warn` with the
chart ref and the full registry URL in the message, so a registry that was
briefly unreachable produced one issue per chart. A failure the next processing
round retries is now `info`; anything else keeps a message naming only the
error class, with the chart and error as structured metadata.

Catalog processing errors are now logged by this module instead of
`@backstage/plugin-catalog-backend-module-logs`. A processing error is an
already-handled outcome — it is stored on the entity, shown in the catalog UI,
and retried on the next round — so transient causes (5xx, 429, socket-level
faults, timeouts) drop to `info` — below the Sentry transport's `warn`
threshold, but still at the default log level, so an upstream outage staling
half the catalog stays greppable. Everything else stays at `warn` with the
same message and metadata as upstream, so a 401 or a file that is really gone
still surfaces, and no longer hides among the timeouts.
