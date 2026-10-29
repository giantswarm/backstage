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
  it('draws every facet the catalog has values on, one value or many', () => {
    // One model for all is still a dropdown (of one option): T64.
    const dimensions = catalogFilterDimensions(items, items, facets, {});
    expect(dimensions.map(dimension => dimension.id)).toEqual([
      'repo',
      'usage',
      'model',
    ]);
    expect(dimensions[2].options).toEqual([
      { id: 'opus', label: 'opus', count: 3 },
    ]);
  });

  it('leaves out a facet no item has a value on', () => {
    const none = items.map(item => ({ ...item, model: undefined }));
    expect(
      catalogFilterDimensions(none, none, facets, {}).map(
        dimension => dimension.id,
      ),
    ).toEqual(['repo', 'usage']);
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
      usage: ['unused'],
    });
    // Source counts follow the usage pick; its own options stay the catalog's.
    expect(repo.selected).toEqual([]);
    expect(repo.options.map(option => [option.id, option.count])).toEqual([
      ['acme/skills', 1],
      ['gs/skills', 1],
    ]);
    // Usage counts ignore its own pick.
    expect(usage.selected).toEqual(['unused']);
    expect(usage.options.map(option => [option.id, option.count])).toEqual([
      ['used', 0],
      ['unused', 2],
    ]);
  });

  it('keeps a picked facet, and a picked value the catalog lost, so it can be undone', () => {
    const one = items.map(item => ({ ...item, repo: 'acme/skills' }));
    const [repo] = catalogFilterDimensions(one, one, facets.slice(0, 1), {
      repo: ['gs/skills'],
    });
    expect(repo.selected).toEqual(['gs/skills']);
    expect(repo.options).toEqual([
      { id: 'acme/skills', label: 'acme/skills', count: 3 },
      { id: 'gs/skills', label: 'gs/skills', count: 0 },
    ]);
  });

  it('counts several picks of one facet as any of them', () => {
    const [repo, usage] = catalogFilterDimensions(items, items, facets, {
      repo: ['acme/skills', 'gs/skills'],
    });
    expect(repo.options.map(option => option.count)).toEqual([2, 1]);
    expect(usage.options.map(option => option.count)).toEqual([1, 2]);
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
        repo: ['acme/skills'],
        usage: ['unused'],
      }).map(item => item.name),
    ).toEqual(['b']);
    expect(applyCatalogFilters(items, facets, { repo: undefined })).toEqual(
      items,
    );
    expect(applyCatalogFilters(items, facets, { repo: [] })).toEqual(items);
  });

  it('keeps any of a facet’s picks, and every facet’s', () => {
    expect(
      applyCatalogFilters(items, facets, {
        repo: ['acme/skills', 'gs/skills'],
        usage: ['unused'],
      }).map(item => item.name),
    ).toEqual(['b', 'c']);
    // An item with no value on a picked facet is not kept.
    expect(
      applyCatalogFilters(
        [...items, { name: 'd', repo: 'x', used: true }],
        facets,
        { model: ['opus'] },
      ).map(item => item.name),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('isCatalogFiltered and catalogFilterKey', () => {
  it('ignore facets picked back to all', () => {
    expect(isCatalogFiltered({ repo: undefined, usage: [] })).toBe(false);
    expect(isCatalogFiltered({ repo: ['x'] })).toBe(true);
    expect(
      catalogFilterKey({
        usage: ['used'],
        repo: ['y', 'x'],
        model: undefined,
        other: [],
      }),
    ).toBe('repo=x,y&usage=used');
  });
});
