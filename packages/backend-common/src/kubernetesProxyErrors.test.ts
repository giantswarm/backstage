import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { mockServices } from '@backstage/backend-test-utils';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { KubernetesProxy } from '@backstage/plugin-kubernetes-backend';
import Sentry from 'winston-sentry-log';
import { sendToSentry, sentryOptions } from './sentryTestUtils';
import type { SentryEvent } from './normalizeSentryEvent';

// Runs the upstream Kubernetes proxy against a cluster that refuses the
// connection, through the real logger and Sentry transport, so a rewording of
// either log line fails here instead of reaching Sentry. See
// giantswarm/giantswarm#39002.

/** The error events the Sentry transport captures, as Sentry builds them. */
function sentryCapture() {
  const events: SentryEvent[] = [];
  let extra: Record<string, unknown> = {};
  const sentryClient = {
    configureScope: () => {},
    withScope: (callback: (scope: unknown) => void) => {
      extra = {};
      callback({
        setExtra: (key: string, value: unknown) => {
          extra[key] = value;
        },
        setTag: () => {},
        setUser: () => {},
      });
    },
    captureException: (error: Error) => {
      events.push({
        exception: { values: [{ value: error.message }] },
        extra,
      });
    },
    captureMessage: () => {},
  };
  const transport = new Sentry({
    config: sentryOptions,
    level: 'warn',
    sentryClient,
    isClientInitialized: true,
  } as any);
  return { events, transport };
}

function listen(server: Server): Promise<number> {
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    ),
  );
}

function close(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

describe('a Kubernetes proxy request to a cluster that refuses it', () => {
  let events: SentryEvent[];
  let backend: Server;
  let backendPort: number;
  let refusingPort: number;

  beforeEach(async () => {
    const capture = sentryCapture();
    events = capture.events;
    const logger = WinstonLogger.create({
      level: 'info',
      transports: [capture.transport],
    });

    const clusters = ['mc-one', 'mc-two'].map(name => ({
      name,
      url: `https://api.${name}.example.com`,
      authMetadata: {},
    }));
    // The upstream step resolves the cluster's URL and credentials, and loads
    // @kubernetes/client-node with a dynamic import that Jest cannot run. The
    // proxy middleware and both log lines stay upstream's. Every cluster's
    // requests go to the refusing port.
    jest
      .spyOn(KubernetesProxy.prototype as any, 'prepareProxyTarget')
      .mockImplementation(async (req: any) => ({
        proxyTarget: {
          protocol: 'http:',
          host: '127.0.0.1',
          port: String(refusingPort),
        },
        rewrittenPath: '/version',
        cluster: clusters.find(
          c => c.name === req.headers['backstage-kubernetes-cluster'],
        ),
      }));

    const proxy = new KubernetesProxy({
      logger,
      clusterSupplier: { getClusters: async () => clusters },
      authStrategy: {} as any,
      discovery: mockServices.discovery(),
      httpAuth: mockServices.httpAuth(),
    });
    const app = express();
    app.use(
      '/proxy',
      proxy.createRequestHandler({
        permissionApi: mockServices.permissions(),
      }),
    );
    backend = createServer(app);
    backendPort = await listen(backend);

    // A port nothing listens on. Taken after the backend's, so it cannot be
    // the backend's: port 0 is never a port in use.
    const closed = createServer();
    refusingPort = await listen(closed);
    await close(closed);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await close(backend);
  });

  async function requestVersion(cluster: string) {
    const response = await fetch(
      `http://127.0.0.1:${backendPort}/proxy/version`,
      { headers: { 'Backstage-Kubernetes-Cluster': cluster } },
    );
    expect(response.status).toBe(500);
    // The transport writes on a later tick than the response.
    await new Promise(resolve => setImmediate(resolve));
  }

  it('reaches Sentry once, without the proxy library duplicate', async () => {
    await requestVersion('mc-one');

    expect(events.map(e => e.exception?.values?.[0]?.value)).toEqual([
      expect.stringMatching(
        /^Kubernetes proxy error Cluster 'mc-one' request error; caused by Error: connect ECONNREFUSED /,
      ),
      expect.stringMatching(
        /^\[HPM\] Error occurred while proxying request \S+ to undefined \[ECONNREFUSED\]/,
      ),
    ]);
    expect(events.map(sendToSentry).filter(Boolean)).toHaveLength(1);
  });

  it('groups the failures of different clusters into one issue', async () => {
    await requestVersion('mc-one');
    await requestVersion('mc-two');

    const sent = events.map(sendToSentry).filter(Boolean) as SentryEvent[];

    expect(sent).toHaveLength(2);
    expect(sent[0].exception?.values?.[0]?.value).toBe(
      'Kubernetes proxy error: cluster request error; caused by Error: connect ECONNREFUSED <host>',
    );
    expect(sent[0].fingerprint).toEqual(sent[1].fingerprint);
  });

  it('keeps the cluster in the extra data and as a tag', async () => {
    await requestVersion('mc-one');
    await requestVersion('mc-two');

    const sent = events.map(sendToSentry).filter(Boolean) as SentryEvent[];

    expect(sent.map(e => e.extra?.cluster)).toEqual(['mc-one', 'mc-two']);
    expect(sent.map(e => e.tags?.cluster)).toEqual(['mc-one', 'mc-two']);
  });
});
