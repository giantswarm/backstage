import { ConfigReader } from '@backstage/config';
import { getSentryTransportConfig } from './rootLogger';
import { isIgnored, sendToSentry } from './sentryTestUtils';

const sentry = {
  dsn: 'https://key@sentry.example.com/1',
  environment: 'test',
  tracesSampleRate: 0,
};

function transportConfig(data: object) {
  return getSentryTransportConfig(new ConfigReader(data as any));
}

describe('getSentryTransportConfig', () => {
  it('is undefined without backend Sentry config', () => {
    expect(transportConfig({ app: { releaseVersion: '2.81.5' } })).toBe(
      undefined,
    );
  });

  it('passes the configured release version as the release', () => {
    expect(
      transportConfig({
        app: { releaseVersion: '2.81.5' },
        backend: {
          errorReporter: { sentry: { ...sentry, releaseVersion: '2.81.4' } },
        },
      }),
    ).toMatchObject({ release: '2.81.4', autoSessionTracking: false });
  });

  it('falls back to the app release version', () => {
    expect(
      transportConfig({
        app: { releaseVersion: '2.81.5' },
        backend: { errorReporter: { sentry } },
      }),
    ).toMatchObject({ release: '2.81.5' });
  });

  it('sends no release when no version is configured', () => {
    expect(
      transportConfig({ backend: { errorReporter: { sentry } } })?.release,
    ).toBe(undefined);
  });
});

describe('the Sentry filters', () => {
  it('ignores the startup 503 the errorHandler logs', () => {
    expect(
      isIgnored(
        'Request failed with status 503 Service has not started up yet',
      ),
    ).toBe(true);
  });

  it.each(['created', 'replaced'])(
    'ignores the empty TechDocs index the search engine says was not %s',
    verb => {
      expect(
        isIgnored(
          `Index for techdocs was not ${verb}: indexer received 0 documents`,
        ),
      ).toBe(true);
    },
  );

  it.each([
    'Index for techdocs was not replaced: an error was encountered',
    'Index for software-catalog was not replaced: indexer received 0 documents',
  ])('still reports %s', message => {
    expect(isIgnored(message)).toBe(false);
  });

  it.each(['ECONNREFUSED', 'ETIMEDOUT'])(
    'ignores the proxy library duplicate of a Kubernetes proxy error (%s)',
    code => {
      expect(
        isIgnored(
          `[HPM] Error occurred while proxying request portal.example.com//version to undefined [${code}] (https://nodejs.org/api/errors.html#errors_common_system_errors)`,
        ),
      ).toBe(true);
    },
  );

  it('still reports a failed request of a proxy backend endpoint', () => {
    expect(
      isIgnored(
        '[HPM] Error occurred while proxying request portal.example.com/api/proxy/grafana/api/health to https://grafana.example.com/ [ECONNREFUSED] (https://nodejs.org/api/errors.html#errors_common_system_errors)',
      ),
    ).toBe(false);
  });

  it('still reports the Kubernetes proxy error itself', () => {
    expect(
      isIgnored(
        "Kubernetes proxy error Cluster 'mc-one' request error; caused by Error: connect ECONNREFUSED 10.0.1.2:443",
      ),
    ).toBe(false);
  });

  it('drops an events poll failure caused by the backend starting up', () => {
    expect(
      sendToSentry({
        message:
          'Poll failed for subscription "signals.*", retrying in 1000ms Request failed with 503 Service Unavailable',
        extra: {
          cause: {
            name: 'ServiceUnavailableError',
            message: 'Service has not started up yet',
          },
        },
      }),
    ).toBe(null);
  });

  it('sets the cluster in extra data as a tag', () => {
    expect(
      sendToSentry({
        message: 'Something failed',
        extra: { cluster: 'mc-one' },
      }),
    ).toMatchObject({ tags: { cluster: 'mc-one' } });
  });

  it('still normalizes every other event', () => {
    expect(
      sendToSentry({
        message: 'Processing of component:default/x failed',
      }),
    ).toMatchObject({ message: 'Processing of an entity failed' });
  });
});
