import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  InventoryProbeError,
  isInventoryAuthError,
  probeInstallationInventory,
} from './probeInstallationInventory';

function kubernetesApi(response: Partial<Response>): KubernetesApi {
  return {
    proxy: jest.fn(async () => response as Response),
  } as unknown as KubernetesApi;
}

describe('probeInstallationInventory', () => {
  it('reads the API groups of the installation', async () => {
    const api = kubernetesApi({
      ok: true,
      status: 200,
      json: async () => ({
        kind: 'APIGroupList',
        groups: [{ name: 'muster.giantswarm.io' }],
      }),
    });

    await expect(
      probeInstallationInventory(api, 'gazelle', { background: false }),
    ).resolves.toEqual({
      kagent: false,
      muster: true,
      kserve: false,
      capi: false,
    });
    expect(api.proxy).toHaveBeenCalledWith({
      clusterName: 'gazelle',
      path: '/apis',
      background: false,
    });
  });

  it('fails a refused probe with the status, the reason and the kubernetes-react error name', async () => {
    // HTTP/2 carries no reason phrase: the status alone is the reason.
    const api = kubernetesApi({ ok: false, status: 401, statusText: '' });

    const error = await probeInstallationInventory(api, 'gazelle', {
      background: false,
    }).catch(e => e);

    expect(error).toBeInstanceOf(InventoryProbeError);
    expect(error).toMatchObject({
      name: 'UnauthorizedError',
      installation: 'gazelle',
      status: 401,
      reason: 'HTTP 401',
      message:
        'Failed to read the API groups of gazelle (GET /apis). Reason: HTTP 401.',
    });
  });

  it('quotes the reason phrase when the response has one', async () => {
    const api = kubernetesApi({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      probeInstallationInventory(api, 'gazelle', { background: true }),
    ).rejects.toMatchObject({
      name: 'ForbiddenError',
      reason: 'HTTP 403 Forbidden',
    });
  });
});

describe('isInventoryAuthError', () => {
  it('is true for a 401 and a 403, false for anything else', () => {
    expect(
      isInventoryAuthError(new InventoryProbeError('gazelle', 401, '')),
    ).toBe(true);
    expect(
      isInventoryAuthError(new InventoryProbeError('gazelle', 403, '')),
    ).toBe(true);
    expect(
      isInventoryAuthError(new InventoryProbeError('gazelle', 503, '')),
    ).toBe(false);
    expect(
      isInventoryAuthError(new InventoryProbeError('gazelle', 500, '')),
    ).toBe(false);
    expect(isInventoryAuthError(new Error('timed out'))).toBe(false);
    expect(isInventoryAuthError(undefined)).toBe(false);
    expect(isInventoryAuthError(null)).toBe(false);
  });
});
