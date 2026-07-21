import { DiscoveryApiClient } from './DiscoveryApiClient';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../installations';

describe('DiscoveryApiClient.getBaseUrl', () => {
  afterEach(() => {
    __resetInstallationsConfigForTests();
  });

  it('returns the default backend URL without blocking on the installations promise when the snapshot is not yet loaded', async () => {
    // Installations are never loaded (the snapshot stays undefined) -- this
    // mirrors the pre-sign-in boot state. getBaseUrl must resolve to the
    // default URL immediately instead of awaiting the (unresolved)
    // installations source, which would deadlock the boot sequence.
    const client = new DiscoveryApiClient('http://backend');

    const timedOut = Symbol('timed-out');
    const result = await Promise.race([
      client.getBaseUrl('auth', 'gazelle'),
      new Promise<typeof timedOut>(resolve => {
        setTimeout(() => resolve(timedOut), 50);
      }),
    ]);

    // If getBaseUrl had awaited the never-resolving installations promise, the
    // race would settle to `timedOut` -- proving there is no deadlock.
    expect(result).toBe('http://backend/api/auth');
  });

  it('applies a per-installation backendUrl override once installations are loaded', async () => {
    setInstallationsConfig([
      { name: 'gazelle', backendUrl: 'http://gazelle.example' },
    ]);
    const client = new DiscoveryApiClient('http://backend');

    const url = await client.getBaseUrl('auth', 'gazelle');

    expect(url).toBe('http://gazelle.example/api/auth');
  });

  it('falls back to the default backend URL for a loaded installation without an override', async () => {
    setInstallationsConfig([{ name: 'gazelle' }]);
    const client = new DiscoveryApiClient('http://backend');

    const url = await client.getBaseUrl('auth', 'gazelle');

    expect(url).toBe('http://backend/api/auth');
  });

  it('never scopes a non-installation plugin id', async () => {
    setInstallationsConfig([
      { name: 'gazelle', backendUrl: 'http://gazelle.example' },
    ]);
    const client = new DiscoveryApiClient('http://backend');

    const url = await client.getBaseUrl('catalog', 'gazelle');

    expect(url).toBe('http://backend/api/catalog');
  });
});
