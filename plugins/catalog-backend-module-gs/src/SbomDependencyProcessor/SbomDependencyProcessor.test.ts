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
    const processor = new SbomDependencyProcessor(mockDb([]), dummyLogger);
    expect(processor.getProcessorName()).toBe('SbomDependencyProcessor');
  });

  it('skips non-Component entities', async () => {
    const entity = makeEntity({ kind: 'API' });
    const processor = new SbomDependencyProcessor(mockDb([]), dummyLogger);

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
    const processor = new SbomDependencyProcessor(mockDb([]), dummyLogger);

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
    const processor = new SbomDependencyProcessor(mockDb([]), dummyLogger);

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
    const processor = new SbomDependencyProcessor(db, dummyLogger);

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
    const processor = new SbomDependencyProcessor(db, dummyLogger);

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
    const processor = new SbomDependencyProcessor(db, logger);

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

  it('does not emit relations', async () => {
    const entity = makeEntity();
    const db = mockDb([{ dependency_name: 'microerror' }]);
    const emit = jest.fn();
    const processor = new SbomDependencyProcessor(db, dummyLogger);

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
