import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import { RepoContentProcessor, withRepoContent } from './RepoContentProcessor';
import { RepoContentSnapshot } from './repoContentSnapshot';
import type { RepoContent, RepoContentStore } from './repoContentStore';

const location = { type: 'url', target: 'https://example.com' };
const alpha = { owner: 'giantswarm', repo: 'alpha' };

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
    const result = withRepoContent(component(), alpha, {
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
      alpha,
      { defaultBranch: 'main', hasReadme: false },
    );

    expect(
      result.metadata.annotations?.['backstage.io/techdocs-ref'],
    ).toBeUndefined();
  });

  it('tags a master default branch, and untags it once renamed', () => {
    const master = withRepoContent(component({}, ['go']), alpha, {
      defaultBranch: 'master',
      hasReadme: true,
    });
    expect(master.metadata.tags).toEqual(['go', 'defaultbranch:master']);

    const renamed = withRepoContent(master, alpha, {
      defaultBranch: 'main',
      hasReadme: true,
    });
    expect(renamed.metadata.tags).toEqual(['go']);
  });

  it.each([
    'dir:.',
    'dir:./docs',
    'url:https://github.com/giantswarm/handbook/tree/main',
  ])('leaves a TechDocs reference set by hand alone: %s', ref => {
    const entity = component({ 'backstage.io/techdocs-ref': ref });

    for (const content of [
      { defaultBranch: 'main', hasReadme: true },
      { defaultBranch: 'main', hasReadme: false },
    ]) {
      expect(
        withRepoContent(entity, alpha, content).metadata.annotations?.[
          'backstage.io/techdocs-ref'
        ],
      ).toBe(ref);
    }
  });

  it('replaces a TechDocs reference to another branch of the same repository', () => {
    const result = withRepoContent(
      component({
        'backstage.io/techdocs-ref':
          'url:https://github.com/giantswarm/alpha/tree/master',
      }),
      alpha,
      { defaultBranch: 'main', hasReadme: true },
    );

    expect(result.metadata.annotations?.['backstage.io/techdocs-ref']).toBe(
      'url:https://github.com/giantswarm/alpha/tree/main',
    );
  });

  it.each(['release/v1', 'fix#1', '100%', 'what?'])(
    'writes no TechDocs reference for a branch a URL cannot carry: %s',
    defaultBranch => {
      const result = withRepoContent(component(), alpha, {
        defaultBranch,
        hasReadme: true,
      });

      expect(result.metadata.annotations).toMatchObject({
        'giantswarm.io/default-branch': defaultBranch,
      });
      expect(
        result.metadata.annotations?.['backstage.io/techdocs-ref'],
      ).toBeUndefined();
    },
  );

  it('writes nothing branch-related for an empty repository', () => {
    const result = withRepoContent(
      component({ 'giantswarm.io/default-branch': 'main' }),
      alpha,
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
      getAll: jest.fn(async () => new Map(Object.entries(records))),
    } as unknown as RepoContentStore;
    return new RepoContentProcessor(
      new RepoContentSnapshot(store, mockServices.logger.mock()),
    );
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

  it('ignores a slug that names no single repository', async () => {
    const entity = component({
      'github.com/project-slug': 'giantswarm/alpha/tree/main',
    });

    expect(
      await run(
        processor({
          'giantswarm/alpha': { defaultBranch: 'main', hasReadme: true },
        }),
        entity,
      ),
    ).toBe(entity);
  });

  it('ignores entities other than components', async () => {
    const entity = { ...component(), kind: 'API' };

    expect(await run(processor({}), entity)).toBe(entity);
  });
});
