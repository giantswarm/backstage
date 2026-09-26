// Loaded with `node --require` ahead of the backend: the auto-instrumentations
// patch modules as they load, so the SDK has to start before anything imports
// them. Configured only through the standard OTEL_* variables, and started
// only when one of them names an exporter; without, nothing is exported.
// Traces only: metrics and logs stay off unless their variable is set.
const { isMainThread } = require('node:worker_threads');

const env = process.env;
const exporting = Boolean(
  env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  env.OTEL_TRACES_EXPORTER,
);

if (isMainThread && exporting) {
  env.OTEL_SERVICE_NAME ??= 'backstage';
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
      }),
    ],
  }).start();
}
