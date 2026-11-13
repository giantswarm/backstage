import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import { mockApis } from '@backstage/test-utils';

import { RoadmapApi, RoadmapApiClient } from './apis';
import { roadmapPlugin } from './plugin';

function createRoadmapApi(fixtures: boolean): RoadmapApi {
  const { factory } = createExtensionTester(
    roadmapPlugin.getExtension('api:roadmap'),
  ).get(ApiBlueprint.dataRefs.factory);
  return factory({
    configApi: mockApis.config({ data: { roadmap: { fixtures } } }),
    discoveryApi: mockApis.discovery(),
    fetchApi: { fetch: jest.fn() },
    authApi: {},
  }) as RoadmapApi;
}

describe('api:roadmap', () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it('serves the fixtures with roadmap.fixtures outside production', async () => {
    const api = createRoadmapApi(true);

    expect(api).not.toBeInstanceOf(RoadmapApiClient);
    await expect(api.getConnection()).resolves.toEqual({ connected: true });
    const { items } = await api.listItems();
    expect(items.map(item => item.title)).toContain('Kubernetes `v1.35`');
  });

  it('ignores roadmap.fixtures in production', () => {
    process.env.NODE_ENV = 'production';

    expect(createRoadmapApi(true)).toBeInstanceOf(RoadmapApiClient);
  });

  it('calls the backend without roadmap.fixtures', () => {
    expect(createRoadmapApi(false)).toBeInstanceOf(RoadmapApiClient);
  });
});
