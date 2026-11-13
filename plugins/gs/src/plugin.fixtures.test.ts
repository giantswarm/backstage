import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  mockApis,
} from '@backstage/frontend-test-utils';

import type { ClusterAccessStatusApi } from './apis/clusterAccessStatus';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from './apis/installations';
import { gsPlugin } from './plugin';

function createStatusApi(fixtures: boolean): ClusterAccessStatusApi {
  // The plugin's type does not carry its extension ids.
  const extension = gsPlugin.getExtension(
    'api:gs/cluster-access-status' as never,
  ) as unknown as ReturnType<typeof ApiBlueprint.make>;
  const { factory } = createExtensionTester(extension).get(
    ApiBlueprint.dataRefs.factory,
  );
  return factory({
    configApi: mockApis.config({ data: { gs: { fixtures } } }),
  }) as ClusterAccessStatusApi;
}

describe('api:gs/cluster-access-status', () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    __resetInstallationsConfigForTests();
  });

  it('reports every configured installation healthy with gs.fixtures', () => {
    const api = createStatusApi(true);
    setInstallationsConfig([
      { name: 'meadow', pipeline: 'testing', authProvider: 'serviceAccount' },
    ]);

    expect(api.getSnapshot()).toEqual([
      expect.objectContaining({ installation: 'meadow', state: 'healthy' }),
    ]);
  });

  it.each([
    ['without gs.fixtures', false, 'test'],
    ['in production', true, 'production'],
  ])('records nothing on its own %s', (_, fixtures, env) => {
    process.env.NODE_ENV = env;
    const api = createStatusApi(fixtures);
    setInstallationsConfig([
      { name: 'meadow', pipeline: 'testing', authProvider: 'serviceAccount' },
    ]);

    expect(api.getSnapshot()).toEqual([]);
  });
});
