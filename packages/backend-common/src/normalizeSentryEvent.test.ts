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

  it('leaves events that need no rewriting untouched', () => {
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
});
