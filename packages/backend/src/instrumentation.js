// Loaded with `node --require` ahead of the backend: the auto-instrumentations
// patch modules as they load, so the SDK has to start before anything imports
// them. Configured only through the standard OTEL_* variables, and started
// only when one of them names an exporter; without, nothing is exported.
// Traces and metrics are independent: either can be on with the other off.
const { isMainThread } = require('node:worker_threads');

const env = process.env;
const tracing = Boolean(
  env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  env.OTEL_TRACES_EXPORTER,
);
const exportingMetrics = Boolean(
  env.OTEL_METRICS_EXPORTER && env.OTEL_METRICS_EXPORTER !== 'none',
);
const exporting = tracing || exportingMetrics;

if (isMainThread && exporting) {
  env.OTEL_SERVICE_NAME ??= 'backstage';
  // A metrics-only start must not fall back to the SDK's default OTLP trace
  // exporter, which would try localhost:4318 with no operator asking for it.
  if (!tracing) {
    env.OTEL_TRACES_EXPORTER ??= 'none';
  }
  env.OTEL_METRICS_EXPORTER ??= 'none';
  env.OTEL_LOGS_EXPORTER ??= 'none';

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const {
    getNodeAutoInstrumentations,
  } = require('@opentelemetry/auto-instrumentations-node');

  new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // The pg instrumentation traces every query already. knex's names its
        // spans after the connection's database, which a `pg` connection in
        // pluginDivisionMode `schema` does not set: `raw undefined`, and for a
        // schema-builder query no name at all, which fails the whole OTLP
        // batch in the exporter's serializer.
        '@opentelemetry/instrumentation-knex': { enabled: false },
        // The kubelet's readiness and liveness probes, a request every few
        // seconds that would otherwise each start a trace.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: req =>
            (req.url ?? '').startsWith('/.backstage/health/'),
        },
      }),
    ],
  }).start();
}
