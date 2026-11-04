import { LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { PgSearchEngine } from '@backstage/plugin-search-backend-module-pg';
import {
  LunrSearchEngine,
  TestPipeline,
} from '@backstage/plugin-search-backend-node';
import { getSentryTransportConfig } from './rootLogger';

// Runs the upstream search engines with an empty TechDocs collator, so a
// rewording of their warning fails here instead of reaching Sentry.

const options = getSentryTransportConfig(
  new ConfigReader({
    backend: {
      errorReporter: {
        sentry: {
          dsn: 'https://key@sentry.example.com/1',
          environment: 'test',
          tracesSampleRate: 0,
        },
      },
    },
  }),
)!;

const isIgnored = (message: string) =>
  options.ignoreErrors.some(pattern => pattern.test(message));

function mockLogger() {
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: () => logger,
  };
  return logger;
}

const techDoc = {
  title: 'Getting started',
  text: 'Hello',
  location: '/docs/default/component/example',
};

async function runLunr(
  engine: LunrSearchEngine,
  documents: (typeof techDoc)[],
) {
  const indexer = await engine.getIndexer('techdocs');
  const closed = new Promise(resolve => indexer.once('close', resolve));
  await TestPipeline.fromIndexer(indexer).withDocuments(documents).execute();
  await closed;
}

describe('the empty TechDocs index warning', () => {
  it('is ignored as the in-memory engine words it before any index exists', async () => {
    const logger = mockLogger();
    const engine = new LunrSearchEngine({
      logger: logger as unknown as LoggerService,
    });

    await runLunr(engine, []);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('was not created');
    expect(isIgnored(logger.warn.mock.calls[0][0])).toBe(true);
  });

  it('is ignored as the in-memory engine words it once an index exists', async () => {
    const logger = mockLogger();
    const engine = new LunrSearchEngine({
      logger: logger as unknown as LoggerService,
    });

    await runLunr(engine, [techDoc]);
    await runLunr(engine, []);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('was not replaced');
    expect(isIgnored(logger.warn.mock.calls[0][0])).toBe(true);
  });

  it('is ignored as the Postgres engine words it', async () => {
    const logger = mockLogger();
    const tx = { rollback: jest.fn() };
    // The indexer class is not exported at runtime, so go through the engine
    // like the search backend does.
    const engine = new PgSearchEngine(
      {
        getTransaction: async () => tx,
        prepareInsert: async () => {},
      } as any,
      new ConfigReader({}),
      logger as unknown as LoggerService,
    );
    const indexer = await engine.getIndexer('techdocs');

    await TestPipeline.fromIndexer(indexer).withDocuments([]).execute();

    expect(tx.rollback).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(isIgnored(logger.warn.mock.calls[0][0])).toBe(true);
  });
});
