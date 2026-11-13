import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import { mockApis } from '@backstage/test-utils';

import { PlansApi, PlansApiClient } from './apis';
import { plansPlugin } from './plugin';

function createPlansApi(fixtures: boolean): PlansApi {
  const { factory } = createExtensionTester(
    plansPlugin.getExtension('api:plans'),
  ).get(ApiBlueprint.dataRefs.factory);
  return factory({
    configApi: mockApis.config({ data: { plans: { fixtures } } }),
    discoveryApi: mockApis.discovery(),
    fetchApi: { fetch: jest.fn() },
    authApi: {},
  }) as PlansApi;
}

describe('api:plans', () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it('serves the fixtures with plans.fixtures outside production', async () => {
    const api = createPlansApi(true);

    expect(api).not.toBeInstanceOf(PlansApiClient);
    await expect(api.listRepos()).resolves.toEqual({
      repositories: ['example/meadow-plans'],
    });
  });

  it('ignores plans.fixtures in production', () => {
    process.env.NODE_ENV = 'production';

    expect(createPlansApi(true)).toBeInstanceOf(PlansApiClient);
  });

  it('calls the backend without plans.fixtures', () => {
    expect(createPlansApi(false)).toBeInstanceOf(PlansApiClient);
  });
});
