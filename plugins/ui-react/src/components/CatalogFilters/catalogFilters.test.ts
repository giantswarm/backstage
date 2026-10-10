import {
  applyCatalogFilters,
  type CatalogFacet,
  catalogFilterDimensions,
  catalogFilterKey,
  isCatalogFiltered,
} from './catalogFilters';

type Item = { name: string; repo: string; used: boolean; model?: string };

const facets: CatalogFacet<Item>[] = [
  { id: 'repo', label: 'Source', value: item => item.repo },
  {
    id: 'usage',
    label: 'Usage',
    value: item => (item.used ? 'used' : 'unused'),
    optionLabel: value => (value === 'used' ? 'Used' : 'Not used'),
    order: ['used', 'unused'],
  },
  { id: 'model', label: 'Model', value: item => item.model },
];

const items: Item[] = [
  { name: 'a', repo: 'acme/skills', used: true, model: 'opus' },
  { name: 'b', repo: 'acme/skills', used: false, model: 'opus' },
  { name: 'c', repo: 'gs/skills', used: false, model: 'opus' },
];

describe('catalogFilterDimensions', () => {
  it('draws only the facets that would change the list', () => {
    // Two sources and both usages discriminate; one model for all does not.
    const dimensions = catalogFilterDimensions(items, items, facets, {});
    expect(dimensions.map(dimension => dimension.id)).toEqual([
      'repo',
      'usage',
    ]);
  });

  it('draws no facet over a catalog of one source', () => {
    const one = items.map(item => ({ ...item, repo: 'acme/skills' }));
    expect(catalogFilterDimensions(one, one, facets.slice(0, 1), {})).toEqual(
      [],
    );
  });

  it('orders by count, then label, unless the facet names an order', () => {
    const [repo, usage] = catalogFilterDimensions(items, items, facets, {});
    expect(repo.options).toEqual([
      { id: 'acme/skills', label: 'acme/skills', count: 2 },
      { id: 'gs/skills', label: 'gs/skills', count: 1 },
    ]);
    expect(usage.options).toEqual([
      { id: 'used', label: 'Used', count: 1 },
      { id: 'unused', label: 'Not used', count: 2 },
    ]);
  });

  it("counts each facet over the search and the other facets' picks", () => {
    const searched = items.filter(item => item.name !== 'a');
    const [repo, usage] = catalogFilterDimensions(items, searched, facets, {
      usage: 'unused',
    });
    // Source counts follow the usage pick; its own options stay the catalog's.
    expect(repo.total).toBe(2);
    expect(repo.options.map(option => [option.id, option.count])).toEqual([
      ['acme/skills', 1],
      ['gs/skills', 1],
    ]);
    // Usage counts ignore its own pick.
    expect(usage.value).toBe('unused');
    expect(usage.options.map(option => [option.id, option.count])).toEqual([
      ['used', 0],
      ['unused', 2],
    ]);
  });

  it('keeps a picked facet, and a picked value the catalog lost, so it can be undone', () => {
    const one = items.map(item => ({ ...item, repo: 'acme/skills' }));
    const [repo] = catalogFilterDimensions(one, one, facets.slice(0, 1), {
      repo: 'gs/skills',
    });
    expect(repo.value).toBe('gs/skills');
    expect(repo.options).toEqual([
      { id: 'acme/skills', label: 'acme/skills', count: 3 },
      { id: 'gs/skills', label: 'gs/skills', count: 0 },
    ]);
  });

  it('scales to 300 entries without a facet per value', () => {
    const many: Item[] = Array.from({ length: 300 }, (_, index) => ({
      name: `skill-${index}`,
      repo: `org/repo-${index % 3}`,
      used: index % 10 === 0,
      model: `model-${index % 12}`,
    }));
    const dimensions = catalogFilterDimensions(many, many, facets, {});
    expect(dimensions.map(dimension => dimension.options.length)).toEqual([
      3, 2, 12,
    ]);
    expect(dimensions[1].options.map(option => option.count)).toEqual([
      30, 270,
    ]);
  });
});

describe('applyCatalogFilters', () => {
  it('keeps what every pick keeps', () => {
    expect(
      applyCatalogFilters(items, facets, {
        repo: 'acme/skills',
        usage: 'unused',
      }).map(item => item.name),
    ).toEqual(['b']);
    expect(applyCatalogFilters(items, facets, { repo: undefined })).toEqual(
      items,
    );
  });
});

describe('isCatalogFiltered and catalogFilterKey', () => {
  it('ignore facets picked back to all', () => {
    expect(isCatalogFiltered({ repo: undefined })).toBe(false);
    expect(isCatalogFiltered({ repo: 'x' })).toBe(true);
    expect(
      catalogFilterKey({ usage: 'used', repo: 'x', model: undefined }),
    ).toBe('repo=x&usage=used');
  });
});
