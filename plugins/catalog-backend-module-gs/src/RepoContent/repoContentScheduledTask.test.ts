import {
  mockServices,
  type TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { getMigratedClient } from '../util/database';
import { refreshRepoContent } from './repoContentScheduledTask';
import { RepoContentStore } from './repoContentStore';

jest.setTimeout(60_000);

function component(name: string, slug?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      namespace: 'default',
      annotations: slug ? { 'github.com/project-slug': slug } : {},
    },
  };
}

function catalog(entities: Entity[]) {
  return {
    streamEntities: async function* streamEntities() {
      yield entities;
    },
    refreshEntity: jest.fn().mockResolvedValue(undefined),
  };
}

function repo(defaultBranch: string, readme = true) {
  return {
    defaultBranchRef: { name: defaultBranch },
    readme: readme ? { __typename: 'Blob' } : null,
  };
}

function graphqlFetch(...bodies: unknown[]) {
  const fetchImpl = jest.fn();
  for (const body of bodies) {
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  }
  return fetchImpl;
}

describe('refreshRepoContent', () => {
  const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

  async function setup(
    databaseId: TestDatabaseId,
    options: { token?: string } = { token: 't' },
  ) {
    const knex = await databases.init(databaseId);
    const store = new RepoContentStore(
      await getMigratedClient(mockServices.database({ knex })),
    );
    const logger = mockServices.logger.mock();
    const run = (
      catalogApi: ReturnType<typeof catalog>,
      fetchImpl: jest.Mock,
    ) =>
      refreshRepoContent({
        credentialsProvider: {
          getCredentials: jest.fn().mockResolvedValue({ token: options.token }),
        },
        integrations: { github: { byUrl: jest.fn() } } as any,
        catalogApi: catalogApi as unknown as CatalogService,
        auth: mockServices.auth(),
        store,
        logger,
        fetchImpl,
      });
    return { store, logger, run };
  }

  it.each(databases.eachSupportedId())(
    'stores every repository and refreshes only the components that changed, %p',
    async databaseId => {
      const { store, run } = await setup(databaseId);
      const entities = [
        component('alpha', 'giantswarm/alpha'),
        component('alpha-docs', 'giantswarm/alpha'),
        component('beta', 'giantswarm/beta'),
        component('no-slug'),
        component('bad-slug', 'giantswarm/beta/tree/main'),
      ];

      const first = catalog(entities);
      await run(
        first,
        graphqlFetch({ data: { r0: repo('main'), r1: repo('master', false) } }),
      );
      expect(await store.get('giantswarm/alpha')).toEqual({
        defaultBranch: 'main',
        hasReadme: true,
      });
      expect(first.refreshEntity.mock.calls.map(c => c[0]).sort()).toEqual([
        'component:default/alpha',
        'component:default/alpha-docs',
        'component:default/beta',
      ]);

      const second = catalog(entities);
      await run(
        second,
        graphqlFetch({ data: { r0: repo('main'), r1: repo('main', false) } }),
      );
      expect(second.refreshEntity.mock.calls.map(c => c[0])).toEqual([
        'component:default/beta',
      ]);
    },
  );

  it.each(databases.eachSupportedId())(
    'drops the record of an unreadable repository and keeps a failed one, %p',
    async databaseId => {
      const { store, run } = await setup(databaseId);
      const entities = [
        component('alpha', 'giantswarm/alpha'),
        component('beta', 'giantswarm/beta'),
      ];
      await run(
        catalog(entities),
        graphqlFetch({ data: { r0: repo('main'), r1: repo('main') } }),
      );

      const next = catalog(entities);
      await run(
        next,
        graphqlFetch({
          data: { r0: null, r1: null },
          errors: [
            { message: 'gone', type: 'NOT_FOUND', path: ['r0'] },
            { message: 'timeout', path: ['r1'] },
          ],
        }),
      );

      expect(await store.get('giantswarm/alpha')).toBeUndefined();
      expect(await store.get('giantswarm/beta')).toEqual({
        defaultBranch: 'main',
        hasReadme: true,
      });
      expect(next.refreshEntity.mock.calls.map(c => c[0])).toEqual([
        'component:default/alpha',
      ]);
    },
  );

  it.each(databases.eachSupportedId())(
    'keeps every record when a batch fails, and removes records no component names, %p',
    async databaseId => {
      const { store, logger, run } = await setup(databaseId);
      await run(
        catalog([
          component('alpha', 'giantswarm/alpha'),
          component('beta', 'giantswarm/beta'),
        ]),
        graphqlFetch({ data: { r0: repo('main'), r1: repo('main') } }),
      );

      const failing = jest
        .fn()
        .mockResolvedValue(
          new Response('', { status: 503, statusText: 'Service Unavailable' }),
        );
      await run(catalog([component('alpha', 'giantswarm/alpha')]), failing);

      expect(await store.get('giantswarm/alpha')).toEqual({
        defaultBranch: 'main',
        hasReadme: true,
      });
      expect(await store.get('giantswarm/beta')).toBeUndefined();
      // A 503 clears up on its own: not a Sentry issue.
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it.each(databases.eachSupportedId())(
    'warns once per owner without a GitHub token and asks nothing, %p',
    async databaseId => {
      const { logger, run } = await setup(databaseId, { token: undefined });
      const fetchImpl = jest.fn();

      await run(
        catalog([
          component('alpha', 'giantswarm/alpha'),
          component('beta', 'giantswarm/beta'),
        ]),
        fetchImpl,
      );

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Repo content refresh: no GitHub token for owner',
        { owner: 'giantswarm' },
      );
    },
  );
});
