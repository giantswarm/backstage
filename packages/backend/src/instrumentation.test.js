const start = jest.fn();
const NodeSDK = jest.fn(() => ({ start }));
const getNodeAutoInstrumentations = jest.fn(() => []);

jest.mock('@opentelemetry/sdk-node', () => ({ NodeSDK }));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations,
}));

const OTEL_VARIABLES = [
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
  'OTEL_TRACES_EXPORTER',
  'OTEL_METRICS_EXPORTER',
];

// Returns the OTEL_* variables as instrumentation.js left them, since the
// module mutates process.env directly and this restores it afterwards.
function load(env) {
  const saved = { ...process.env };
  for (const name of OTEL_VARIABLES) {
    delete process.env[name];
  }
  Object.assign(process.env, env);
  try {
    jest.isolateModules(() => require('./instrumentation'));
    return Object.fromEntries(
      OTEL_VARIABLES.map(name => [name, process.env[name]]),
    );
  } finally {
    process.env = saved;
  }
}

describe('instrumentation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts nothing without an exporter', () => {
    load({});
    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('exports traces with the knex instrumentation off', () => {
    load({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317' });
    expect(start).toHaveBeenCalledTimes(1);
    // knex names a span after the connection's database; a pg connection in
    // pluginDivisionMode schema has none, and a span without a name fails the
    // whole OTLP batch. pg traces the same queries.
    expect(getNodeAutoInstrumentations).toHaveBeenCalledWith(
      expect.objectContaining({
        '@opentelemetry/instrumentation-knex': { enabled: false },
      }),
    );
  });

  it('leaves metrics off when only traces are exported', () => {
    const result = load({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317',
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.OTEL_METRICS_EXPORTER).toBe('none');
  });

  it('starts the SDK for metrics alone and turns traces off', () => {
    const result = load({ OTEL_METRICS_EXPORTER: 'prometheus' });
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.OTEL_TRACES_EXPORTER).toBe('none');
    expect(result.OTEL_METRICS_EXPORTER).toBe('prometheus');
  });
});
