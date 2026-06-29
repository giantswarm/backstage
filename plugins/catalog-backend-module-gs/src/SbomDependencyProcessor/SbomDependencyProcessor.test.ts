import type { Entity } from '@backstage/catalog-model';
import { SbomDependencyProcessor } from './SbomDependencyProcessor';

function mockDb(rows: Array<{ dependency_name: string }>) {
  const selectMock = jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(rows),
  });
  const knex = jest.fn().mockReturnValue({
    select: selectMock,
  });
  return knex as any;
}

function mockAuth() {
  return {
    getOwnServiceCredentials: jest.fn().mockResolvedValue({}),
    getPluginRequestToken: jest.fn().mockResolvedValue({ token: 'token' }),
    authenticate: jest.fn().mockResolvedValue({}),
  } as any;
}

// Catalog stub returning the given component names in the default namespace.
function mockCatalogApi(componentNames: string[]) {
  return {
    getEntities: jest.fn().mockResolvedValue({
      items: componentNames.map(name => ({
        kind: 'Component',
        metadata: { name, namespace: 'default' },
      })),
    }),
  } as any;
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'my-service',
      annotations: {
        'github.com/project-slug': 'giantswarm/my-service',
      },
    },
    spec: {
      type: 'service',
      lifecycle: 'production',
      owner: 'team-honeybadger',
    },
    ...overrides,
  };
}

const dummyLocation = { type: 'url', target: 'https://example.com' };
const dummyEmit = jest.fn();
const dummyCache = { get: jest.fn(), set: jest.fn() };
const dummyLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

describe('SbomDependencyProcessor', () => {
  it('returns processor name', () => {
    const processor = new SbomDependencyProcessor(
      mockDb([]),
      dummyLogger,
      mockCatalogApi([]),
      mockAuth(),
    );
    expect(processor.getProcessorName()).toBe('SbomDependencyProcessor');
  });

  it('skips non-Component entities', async () => {
    const entity = makeEntity({ kind: 'API' });
    const processor = new SbomDependencyProcessor(
      mockDb([]),
      dummyLogger,
      mockCatalogApi([]),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect(result).toBe(entity);
  });

  it('skips entities without project-slug annotation', async () => {
    const entity = makeEntity({
      metadata: { name: 'test', annotations: {} },
    });
    const processor = new SbomDependencyProcessor(
      mockDb([]),
      dummyLogger,
      mockCatalogApi([]),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect(result).toBe(entity);
  });

  it('returns entity unchanged when no DB rows exist', async () => {
    const entity = makeEntity();
    const processor = new SbomDependencyProcessor(
      mockDb([]),
      dummyLogger,
      mockCatalogApi([]),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect(result).toBe(entity);
  });

  it('adds dependsOn from DB data', async () => {
    const entity = makeEntity();
    const db = mockDb([
      { dependency_name: 'microerror' },
      { dependency_name: 'k8smetadata' },
    ]);
    const processor = new SbomDependencyProcessor(
      db,
      dummyLogger,
      mockCatalogApi(['microerror', 'k8smetadata']),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect((result.spec as any).dependsOn).toEqual([
      'component:microerror',
      'component:k8smetadata',
    ]);
  });

  it('merges with existing dependsOn without duplicates', async () => {
    const entity = makeEntity();
    (entity.spec as any).dependsOn = [
      'component:microerror',
      'component:existing-dep',
    ];
    const db = mockDb([
      { dependency_name: 'microerror' },
      { dependency_name: 'k8smetadata' },
    ]);
    const processor = new SbomDependencyProcessor(
      db,
      dummyLogger,
      mockCatalogApi(['microerror', 'k8smetadata']),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect((result.spec as any).dependsOn).toEqual([
      'component:microerror',
      'component:existing-dep',
      'component:k8smetadata',
    ]);
  });

  it('handles DB query errors gracefully', async () => {
    const entity = makeEntity();
    const db = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('DB connection failed')),
      }),
    }) as any;
    const logger = { ...dummyLogger, warn: jest.fn() };
    const processor = new SbomDependencyProcessor(
      db,
      logger,
      mockCatalogApi([]),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect(result).toBe(entity);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to query SBOM dependencies'),
    );
  });

  it('filters out dependencies whose component is not in the catalog', async () => {
    const entity = makeEntity();
    const db = mockDb([
      { dependency_name: 'microerror' },
      { dependency_name: 'versionbundle' },
    ]);
    // versionbundle has no catalog component -> should be dropped to avoid a
    // dangling relation.
    const processor = new SbomDependencyProcessor(
      db,
      dummyLogger,
      mockCatalogApi(['microerror']),
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect((result.spec as any).dependsOn).toEqual(['component:microerror']);
  });

  it('keeps all dependencies when the catalog cannot be queried', async () => {
    const entity = makeEntity();
    const db = mockDb([
      { dependency_name: 'microerror' },
      { dependency_name: 'versionbundle' },
    ]);
    const catalogApi = {
      getEntities: jest.fn().mockRejectedValue(new Error('catalog down')),
    } as any;
    const logger = { ...dummyLogger, warn: jest.fn() };
    const processor = new SbomDependencyProcessor(
      db,
      logger,
      catalogApi,
      mockAuth(),
    );

    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache as any,
    );

    expect((result.spec as any).dependsOn).toEqual([
      'component:microerror',
      'component:versionbundle',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load existing components'),
    );
  });

  it('does not emit relations', async () => {
    const entity = makeEntity();
    const db = mockDb([{ dependency_name: 'microerror' }]);
    const emit = jest.fn();
    const processor = new SbomDependencyProcessor(
      db,
      dummyLogger,
      mockCatalogApi(['microerror']),
      mockAuth(),
    );

    await processor.preProcessEntity(
      entity,
      dummyLocation,
      emit,
      dummyLocation,
      dummyCache as any,
    );

    expect(emit).not.toHaveBeenCalled();
  });
});
