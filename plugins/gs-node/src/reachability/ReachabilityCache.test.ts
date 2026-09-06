import { mockServices } from '@backstage/backend-test-utils';
import type { EndpointProbeResult } from './probeEndpoint';
import {
  DEFAULT_REACHABILITY_TTL_MS,
  ReachabilityCache,
  reachabilityFields,
} from './ReachabilityCache';

const URL_A =
  'https://muster.golem.example.io/.well-known/oauth-protected-resource';
const URL_B = 'https://kagent.wombat.example.io/api/sessions';

/** A probe whose answers are handed out in order, and whose promises the test controls. */
function controlledProbe() {
  const pending: Array<{
    url: string;
    resolve: (result: EndpointProbeResult) => void;
    reject: (error: unknown) => void;
  }> = [];
  const probe = jest.fn(
    (url: string) =>
      new Promise<EndpointProbeResult>((resolve, reject) => {
        pending.push({ url, resolve, reject });
      }),
  );
  return { probe, pending };
}

/** Lets the microtask queue drain so `.then` handlers after a resolve have run. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('ReachabilityCache', () => {
  let clock = 1_000_000;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
  });

  it("answers 'unknown' until the first probe settles, then the answer", async () => {
    const { probe, pending } = controlledProbe();
    const cache = new ReachabilityCache({ probe, now });

    expect(cache.get(URL_A)).toEqual({ reachable: 'unknown' });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(URL_A);

    pending[0].resolve({ reachable: true, checkedAt: now() });
    await settle();

    expect(cache.get(URL_A)).toEqual({ reachable: true, checkedAt: now() });
  });

  it('carries the probe reason for an unreachable endpoint', async () => {
    const cache = new ReachabilityCache({
      probe: async () => ({
        reachable: false,
        reason: 'DNS lookup failed (ENOTFOUND)',
        checkedAt: now(),
      }),
      now,
    });

    await cache.refresh(URL_A);

    expect(cache.get(URL_A)).toEqual({
      reachable: false,
      reason: 'DNS lookup failed (ENOTFOUND)',
      checkedAt: now(),
    });
  });

  it('serves a fresh answer from the cache without re-probing', async () => {
    const probe = jest.fn(async () => ({ reachable: true, checkedAt: now() }));
    const cache = new ReachabilityCache({ probe, now });

    await cache.refresh(URL_A);
    clock += DEFAULT_REACHABILITY_TTL_MS - 1;
    cache.get(URL_A);
    cache.get(URL_A);
    cache.get(URL_A);

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('re-probes in the background once the answer is stale, still serving the old one', async () => {
    const { probe, pending } = controlledProbe();
    const cache = new ReachabilityCache({ probe, now });

    cache.get(URL_A);
    pending[0].resolve({ reachable: true, checkedAt: now() });
    await settle();
    const firstCheckedAt = now();

    clock += DEFAULT_REACHABILITY_TTL_MS;
    // Stale: the request is answered immediately with the previous result and
    // a refresh starts behind it.
    expect(cache.get(URL_A)).toEqual({
      reachable: true,
      checkedAt: firstCheckedAt,
    });
    expect(probe).toHaveBeenCalledTimes(2);

    pending[1].resolve({
      reachable: false,
      reason: 'connection refused (ECONNREFUSED)',
      checkedAt: now(),
    });
    await settle();

    expect(cache.get(URL_A)).toEqual({
      reachable: false,
      reason: 'connection refused (ECONNREFUSED)',
      checkedAt: now(),
    });
  });

  it('honours a custom TTL', async () => {
    const probe = jest.fn(async () => ({ reachable: true, checkedAt: now() }));
    const cache = new ReachabilityCache({ probe, now, ttlMs: 10 });

    await cache.refresh(URL_A);
    clock += 10;
    cache.get(URL_A);

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent probes of the same URL', async () => {
    const { probe, pending } = controlledProbe();
    const cache = new ReachabilityCache({ probe, now });

    // Three requests for the same endpoint while the first probe is still out,
    // plus an explicit refresh: one probe.
    cache.get(URL_A);
    cache.get(URL_A);
    cache.get(URL_A);
    const refreshed = cache.refresh(URL_A);

    expect(probe).toHaveBeenCalledTimes(1);

    pending[0].resolve({ reachable: true, checkedAt: now() });
    await expect(refreshed).resolves.toEqual({
      reachable: true,
      checkedAt: now(),
    });

    // Once settled, a stale request starts a new probe again.
    clock += DEFAULT_REACHABILITY_TTL_MS;
    cache.get(URL_A);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('keys per URL', async () => {
    const probe = jest.fn(async (url: string) => ({
      reachable: url === URL_A,
      ...(url !== URL_A && { reason: 'connection refused (ECONNREFUSED)' }),
      checkedAt: now(),
    }));
    const cache = new ReachabilityCache({ probe, now });

    await Promise.all([cache.refresh(URL_A), cache.refresh(URL_B)]);

    expect(cache.get(URL_A).reachable).toBe(true);
    expect(cache.get(URL_B)).toEqual({
      reachable: false,
      reason: 'connection refused (ECONNREFUSED)',
      checkedAt: now(),
    });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('records a probe that resolves with nothing as unreachable', async () => {
    const cache = new ReachabilityCache({
      probe: async () => undefined as unknown as EndpointProbeResult,
      now,
    });

    await cache.refresh(URL_A);

    expect(cache.get(URL_A)).toEqual({
      reachable: false,
      reason: 'probe failed',
      checkedAt: now(),
    });
  });

  it('records a throwing probe as unreachable rather than unknown forever', async () => {
    const cache = new ReachabilityCache({
      probe: async () => {
        throw new Error('bug in the probe');
      },
      now,
    });

    await cache.refresh(URL_A);

    expect(cache.get(URL_A)).toEqual({
      reachable: false,
      reason: 'probe failed',
      checkedAt: now(),
    });
  });

  describe('logging', () => {
    it('logs one INFO line per state change and nothing per request', async () => {
      const logger = mockServices.logger.mock();
      const answers: EndpointProbeResult[] = [
        { reachable: true, checkedAt: 1 },
        { reachable: true, checkedAt: 2 },
        {
          reachable: false,
          reason: 'connection refused (ECONNREFUSED)',
          checkedAt: 3,
        },
        {
          reachable: false,
          reason: 'connection refused (ECONNREFUSED)',
          checkedAt: 4,
        },
        { reachable: true, checkedAt: 5 },
      ];
      const cache = new ReachabilityCache({
        probe: async () => answers.shift()!,
        logger,
        now,
      });

      for (let i = 0; i < 5; i += 1) {
        // `refresh` forces a probe; the answer stays fresh, so the requests in
        // between hit the cache and must not log (or probe).
        await cache.refresh(URL_A);
        cache.get(URL_A);
        cache.get(URL_A);
      }

      expect(logger.info).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        `Endpoint reachable: ${URL_A}`,
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        `Endpoint not reachable from this portal: ${URL_A} (connection refused (ECONNREFUSED))`,
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        3,
        `Endpoint reachable: ${URL_A}`,
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs a changed reason even when the endpoint stays unreachable', async () => {
      const logger = mockServices.logger.mock();
      const answers: EndpointProbeResult[] = [
        { reachable: false, reason: 'no answer within 3000 ms', checkedAt: 1 },
        {
          reachable: false,
          reason: 'DNS lookup failed (ENOTFOUND)',
          checkedAt: 2,
        },
      ];
      const cache = new ReachabilityCache({
        probe: async () => answers.shift()!,
        logger,
        now,
      });

      await cache.refresh(URL_A);
      await cache.refresh(URL_A);

      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });
});

describe('reachabilityFields', () => {
  it('emits reason only when there is one', () => {
    expect(reachabilityFields({ reachable: 'unknown' })).toEqual({
      reachable: 'unknown',
    });
    expect(reachabilityFields({ reachable: true, checkedAt: 5 })).toEqual({
      reachable: true,
    });
    expect(
      reachabilityFields({
        reachable: false,
        reason: 'connection refused (ECONNREFUSED)',
        checkedAt: 5,
      }),
    ).toEqual({
      reachable: false,
      reason: 'connection refused (ECONNREFUSED)',
    });
  });
});
