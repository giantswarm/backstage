import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import { RepoContentProcessor, withRepoContent } from './RepoContentProcessor';
import type { RepoContent, RepoContentStore } from './repoContentStore';

const location = { type: 'url', target: 'https://example.com' };

function component(
  annotations: Record<string, string> = {},
  tags?: string[],
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'alpha',
      annotations: {
        'github.com/project-slug': 'giantswarm/alpha',
        ...annotations,
      },
      ...(tags ? { tags } : {}),
    },
  };
}

describe('withRepoContent', () => {
  it('writes the default branch and a TechDocs reference ending in it', () => {
    const result = withRepoContent(component(), {
      defaultBranch: 'main',
      hasReadme: true,
    });

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/default-branch': 'main',
      'backstage.io/techdocs-ref':
        'url:https://github.com/giantswarm/alpha/tree/main',
    });
    expect(result.metadata.tags).toBeUndefined();
  });

  it('removes a TechDocs reference when the default branch has no README', () => {
    const result = withRepoContent(
      component({
        'backstage.io/techdocs-ref':
          'url:https://github.com/giantswarm/alpha/tree/main',
      }),
      { defaultBranch: 'main', hasReadme: false },
    );

    expect(
      result.metadata.annotations?.['backstage.io/techdocs-ref'],
    ).toBeUndefined();
  });

  it('tags a master default branch, and untags it once renamed', () => {
    const master = withRepoContent(component({}, ['go']), {
      defaultBranch: 'master',
      hasReadme: true,
    });
    expect(master.metadata.tags).toEqual(['go', 'defaultbranch:master']);

    const renamed = withRepoContent(master, {
      defaultBranch: 'main',
      hasReadme: true,
    });
    expect(renamed.metadata.tags).toEqual(['go']);
  });

  it('writes nothing branch-related for an empty repository', () => {
    const result = withRepoContent(
      component({ 'giantswarm.io/default-branch': 'main' }),
      { hasReadme: false },
    );

    expect(result.metadata.annotations).toEqual({
      'github.com/project-slug': 'giantswarm/alpha',
    });
  });
});

describe('RepoContentProcessor', () => {
  function processor(records: Record<string, RepoContent>) {
    const store = {
      get: jest.fn(async (slug: string) => records[slug]),
    } as unknown as RepoContentStore;
    return new RepoContentProcessor(store, mockServices.logger.mock());
  }

  const run = (p: RepoContentProcessor, entity: Entity) =>
    p.preProcessEntity(entity, location, jest.fn(), location, {
      get: jest.fn(),
      set: jest.fn(),
    });

  it('applies the stored record', async () => {
    const result = await run(
      processor({
        'giantswarm/alpha': { defaultBranch: 'main', hasReadme: true },
      }),
      component(),
    );

    expect(result.metadata.annotations?.['giantswarm.io/default-branch']).toBe(
      'main',
    );
  });

  it('leaves the entity as it arrived while no record exists', async () => {
    const entity = component({
      'backstage.io/techdocs-ref':
        'url:https://github.com/giantswarm/alpha/tree/main',
    });

    expect(await run(processor({}), entity)).toBe(entity);
  });

  it('ignores entities other than components', async () => {
    const entity = { ...component(), kind: 'API' };

    expect(await run(processor({}), entity)).toBe(entity);
  });
});
