import { ConfigReader } from '@backstage/config';
import { getSentryTransportConfig } from './rootLogger';

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
  const options = transportConfig({ backend: { errorReporter: { sentry } } })!;

  it('ignores the startup 503 the errorHandler logs', () => {
    expect(
      options.ignoreErrors.some(pattern =>
        pattern.test(
          'Request failed with status 503 Service has not started up yet',
        ),
      ),
    ).toBe(true);
  });

  it('drops an events poll failure caused by the backend starting up', () => {
    expect(
      options.beforeSend({
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

  it('still normalizes every other event', () => {
    expect(
      options.beforeSend({
        message: 'Processing of component:default/x failed',
      }),
    ).toMatchObject({ message: 'Processing of an entity failed' });
  });
});
