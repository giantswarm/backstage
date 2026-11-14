import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { ModelManagerFixtureApi } from './ModelManagerFixtureApi';
import { ModelHostingFixtureState } from './modelHostingFixtureState';

const NOW = Date.parse('2026-11-14T12:00:00Z');

function setup() {
  const state = new ModelHostingFixtureState(
    createFixtureDataSet({ now: NOW }),
    () => NOW,
  );
  return new ModelManagerFixtureApi(
    {
      discoveryApi: {} as never,
      fetchApi: {} as never,
      kubernetesApi: {} as never,
      kubernetesAuthProvidersApi: {} as never,
    },
    () => state,
  );
}

describe('ModelManagerFixtureApi', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the inventory through the model-manager tools, parsed as the real answers', async () => {
    const api = setup();
    const models = await api.listModels('meadow');
    expect(models.length).toBeGreaterThan(0);
    expect(new Set(models.map(m => m.backend))).toEqual(
      new Set(['kserve', 'ollama']),
    );
    await expect(api.getBackend('meadow')).resolves.toEqual(
      expect.objectContaining({ backend: 'kserve', healthy: true }),
    );
  });

  it('fails the unreachable installation as muster does, and one it does not serve loudly', async () => {
    const api = setup();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(api.listBackends('tarragon')).rejects.toThrow(
      'tarragon did not answer: not reachable from this portal (timeout)',
    );
    await expect(api.listBackends('elsewhere')).rejects.toThrow(
      'Fixture mode serves no installation elsewhere',
    );
  });

  it('tries a served model: refused without a token, answered with one', async () => {
    const api = setup();
    const ready = (await api.listLoaded('meadow', { backend: 'kserve' })).find(
      m => m.status === 'Ready',
    )!;
    const result = await api.tryModel('meadow', {
      model: ready.name,
      url: ready.endpoint!,
    });
    expect(result.without.status).toBe(401);
    expect(result.with).toEqual(
      expect.objectContaining({ status: 200, content: expect.any(String) }),
    );
  });
});
