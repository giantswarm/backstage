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
