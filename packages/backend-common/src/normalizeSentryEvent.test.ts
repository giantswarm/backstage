import type { SentryEvent } from './normalizeSentryEvent';
import { normalizeSentryEvent } from './normalizeSentryEvent';

describe('normalizeSentryEvent', () => {
  it('collapses database keepalive failures across plugins', () => {
    const first = normalizeSentryEvent<SentryEvent>({
      message:
        'Database keepalive failed for plugin catalog, Error: connect ECONNREFUSED 172.31.110.136:5432',
    });
    const second = normalizeSentryEvent<SentryEvent>({
      message:
        'Database keepalive failed for plugin search, Error: connect ECONNREFUSED 172.31.110.136:5432',
    });

    expect(first.message).toBe(
      'Database keepalive failed, Error: connect ECONNREFUSED <address>',
    );
    expect(first.fingerprint).toEqual(second.fingerprint);
  });

  it('collapses catalog processing failures across entities', () => {
    const first = normalizeSentryEvent<SentryEvent>({
      message:
        'Processing of component:default/event-exporter-app failed connect ECONNREFUSED 172.31.110.136:5432',
    });
    const second = normalizeSentryEvent<SentryEvent>({
      message:
        'Processing of component:default/pr-gatekeeper failed connect ECONNREFUSED 172.31.110.136:5432',
    });

    expect(first.message).toBe(
      'Processing of an entity failed connect ECONNREFUSED <address>',
    );
    expect(first.fingerprint).toEqual(second.fingerprint);
  });

  it('collapses Kubernetes proxy errors across clusters', () => {
    const first = normalizeSentryEvent<SentryEvent>({
      message:
        "Kubernetes proxy error Cluster 'mc-one' request error; caused by Error: connect ETIMEDOUT 10.0.1.2:443",
      extra: { cluster: 'mc-one' },
    });
    const second = normalizeSentryEvent<SentryEvent>({
      message:
        "Kubernetes proxy error Cluster 'mc-two' request error; caused by Error: connect ETIMEDOUT 10.0.3.4:443",
      extra: { cluster: 'mc-two' },
    });

    expect(first.message).toBe(
      'Kubernetes proxy error: cluster request error; caused by Error: connect ETIMEDOUT <host>',
    );
    expect(first.fingerprint).toEqual(second.fingerprint);
    expect(first.extra).toMatchObject({ cluster: 'mc-one' });
    expect(first.tags).toEqual({ cluster: 'mc-one' });
  });

  it.each([
    [
      'an unresolvable API host',
      'Error: getaddrinfo ENOTFOUND api.mc-one.example.com',
      'Error: getaddrinfo ENOTFOUND api.mc-two.example.com',
      'Error: getaddrinfo ENOTFOUND <host>',
    ],
    [
      'a local address after the host',
      'Error: connect ECONNREFUSED ::1:443 - Local (::1:45678)',
      'Error: connect ECONNREFUSED ::2:443 - Local (::2:45679)',
      'Error: connect ECONNREFUSED <host>',
    ],
    [
      'any text after an unresolvable host',
      'Error: getaddrinfo EAI_AGAIN api.mc-one.example.com (retrying)',
      'Error: getaddrinfo EAI_AGAIN api.mc-two.example.com (retrying)',
      'Error: getaddrinfo EAI_AGAIN <host>',
    ],
    [
      'an IPv6 address',
      'Error: connect ECONNREFUSED 2001:db8::1:443',
      'Error: connect ECONNREFUSED 2001:db8::2:443',
      'Error: connect ECONNREFUSED <host>',
    ],
    [
      'a certificate for another host',
      "Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames: Host: api.mc-one.example.com. is not in the cert's altnames: DNS:api.mc-one.example.org",
      "Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames: Host: api.mc-two.example.com. is not in the cert's altnames: DNS:api.mc-two.example.org",
      "Error [ERR_TLS_CERT_ALTNAME_INVALID]: Hostname/IP does not match certificate's altnames",
    ],
  ])(
    'collapses Kubernetes proxy errors whose cause names the cluster: %s',
    (_, firstCause, secondCause, normalizedCause) => {
      const [first, second] = [
        ['mc-one', firstCause],
        ['mc-two', secondCause],
      ].map(([cluster, cause]) =>
        normalizeSentryEvent<SentryEvent>({
          message: `Kubernetes proxy error Cluster '${cluster}' request error; caused by ${cause}`,
        }),
      );

      expect(first.message).toBe(
        `Kubernetes proxy error: cluster request error; caused by ${normalizedCause}`,
      );
      expect(first.fingerprint).toEqual(second.fingerprint);
    },
  );

  it('keeps Kubernetes proxy errors with different causes apart', () => {
    const [refused, timedOut, aggregate] = [
      'Error: connect ECONNREFUSED 10.0.1.2:443',
      'Error: connect ETIMEDOUT 10.0.1.2:443',
      'AggregateError',
    ].map(
      cause =>
        normalizeSentryEvent<SentryEvent>({
          message: `Kubernetes proxy error Cluster 'mc-one' request error; caused by ${cause}`,
        }).fingerprint,
    );

    expect(new Set([refused, timedOut, aggregate].map(String)).size).toBe(3);
  });

  it('collapses messages that differ only by URL', () => {
    const first = normalizeSentryEvent<SentryEvent>({
      message:
        'Unable to read giantswarm https://github.com/giantswarm/backstage-catalogs/blob/v0.3.0/a.yaml, Error: Request failed for https://api.github.com/repos/giantswarm/backstage-catalogs/contents/a.yaml?ref=6e99c576e0004738077c3666fe069affd2162469, 504 Gateway Timeout',
    });
    const second = normalizeSentryEvent<SentryEvent>({
      message:
        'Unable to read giantswarm https://github.com/giantswarm/backstage-catalogs/blob/v0.3.0/b.yaml, Error: Request failed for https://api.github.com/repos/giantswarm/backstage-catalogs/contents/b.yaml?ref=1112223330004738077c3666fe069affd2162469, 504 Gateway Timeout',
    });

    expect(first.message).toBe(
      'Unable to read giantswarm <url>, Error: Request failed for <url>, 504 Gateway Timeout',
    );
    expect(first.fingerprint).toEqual(second.fingerprint);
  });

  it('keeps distinct faults apart', () => {
    const timeout = normalizeSentryEvent<SentryEvent>({
      message:
        'Unable to read giantswarm https://github.com/giantswarm/x.yaml, Error: Request failed for https://api.github.com/repos/x, 504 Gateway Timeout',
    });
    const unauthorized = normalizeSentryEvent<SentryEvent>({
      message:
        'Unable to read giantswarm https://github.com/giantswarm/x.yaml, Error: Request failed for https://api.github.com/repos/x, 401 Unauthorized',
    });

    expect(timeout.fingerprint).not.toEqual(unauthorized.fingerprint);
  });

  it('preserves the original message as extra data', () => {
    const event = normalizeSentryEvent<SentryEvent>({
      message: 'Database keepalive failed for plugin auth, Error: nope',
    });

    expect(event.extra).toEqual({
      original_message:
        'Database keepalive failed for plugin auth, Error: nope',
    });
  });

  it.each(['cluster', 'installation', 'tool', 'server'])(
    'sets %s from the extra data as a tag',
    key => {
      const event = normalizeSentryEvent<SentryEvent>({
        message: 'Something went wrong',
        extra: { [key]: 'example', other: 'value' },
      });

      expect(event.tags).toEqual({ [key]: 'example' });
    },
  );

  it('leaves the message of events that need no rewriting untouched', () => {
    const event = normalizeSentryEvent<SentryEvent>({
      message: 'Something went wrong',
      extra: { plugin: 'catalog' },
    });

    expect(event.message).toBe('Something went wrong');
    expect(event.fingerprint).toBeUndefined();
    expect(event.extra).toEqual({ plugin: 'catalog' });
  });

  it('normalizes exception events', () => {
    const event = normalizeSentryEvent<SentryEvent>({
      exception: {
        values: [
          { value: 'Processing of component:default/mcp-capi failed, boom' },
        ],
      },
    });

    expect(event.exception!.values![0].value).toBe(
      'Processing of an entity failed, boom',
    );
    expect(event.fingerprint).toEqual(['Processing of an entity failed, boom']);
  });

  it('reads the structured message form', () => {
    const event = normalizeSentryEvent<SentryEvent>({
      message: {
        formatted: 'Database keepalive failed for plugin events, Error: nope',
      },
    });

    expect(event.message).toEqual({
      formatted: 'Database keepalive failed, Error: nope',
    });
  });

  describe('muster tool errors', () => {
    /**
     * The error middleware's log line of a MusterToolError, as the Sentry
     * transport makes an event of it: the error's own properties are extra.
     */
    function toolErrorEvent(
      message: string,
      extra: Record<string, unknown>,
    ): SentryEvent {
      return {
        exception: {
          values: [{ value: `Request failed with status 500 ${message}` }],
        },
        extra: {
          name: 'MusterToolError',
          details: [],
          installation: 'gazelle',
          plugin: 'muster',
          ...extra,
        },
      };
    }

    it('groups by kind and tool, whatever the message and installation', () => {
      const [first, second] = [
        ['gazelle', 30],
        ['golem', 60],
      ].map(([installation, seconds]) =>
        normalizeSentryEvent(
          toolErrorEvent(
            `Tool execution failed: no answer within the server's timeout of ${seconds}s: context deadline exceeded`,
            {
              installation,
              kind: 'timeout',
              tool: 'x_prometheus_execute_query',
              server: 'prometheus',
            },
          ),
        ),
      );

      expect(first.fingerprint).toEqual([
        'MusterToolError',
        'timeout',
        'x_prometheus_execute_query',
      ]);
      expect(second.fingerprint).toEqual(first.fingerprint);
      expect(first.tags).toEqual({
        installation: 'gazelle',
        tool: 'x_prometheus_execute_query',
        server: 'prometheus',
      });
    });

    it('keeps the same kind of another tool apart', () => {
      const [prometheus, kubernetes] = [
        'x_prometheus_execute_query',
        'x_kubernetes_list',
      ].map(
        tool =>
          normalizeSentryEvent(
            toolErrorEvent('Tool execution failed: client not connected', {
              kind: 'client_not_connected',
              tool,
            }),
          ).fingerprint,
      );

      expect(prometheus).not.toEqual(kubernetes);
    });

    // giantswarm/giantswarm#39001: one fault, a different workflow name each time.
    it('groups an unknown kind by its message, quoted values replaced', () => {
      const [first, second] = ['deploy app', 'rotate keys'].map(workflow =>
        normalizeSentryEvent(
          toolErrorEvent(
            `Failed to list executions: unable to parse requirement: values[0][muster.giantswarm.io/workflow]: Invalid value: "${workflow}"`,
            { tool: 'core_workflow_execution_list' },
          ),
        ),
      );

      const normalized =
        'Request failed with status 500 Failed to list executions: unable to parse requirement: values[0][muster.giantswarm.io/workflow]: Invalid value: "<value>"';
      expect(first.fingerprint).toEqual([
        'MusterToolError',
        normalized,
        'core_workflow_execution_list',
      ]);
      expect(second.fingerprint).toEqual(first.fingerprint);
      expect(first.exception!.values![0].value).toBe(normalized);
      expect(first.extra).toMatchObject({
        original_message:
          'Request failed with status 500 Failed to list executions: unable to parse requirement: values[0][muster.giantswarm.io/workflow]: Invalid value: "deploy app"',
      });
    });

    it('leaves quoted values in other events alone', () => {
      const event = normalizeSentryEvent<SentryEvent>({
        message: 'no team file for "bumblebee"',
      });

      expect(event.message).toBe('no team file for "bumblebee"');
      expect(event.fingerprint).toBeUndefined();
    });
  });
});
