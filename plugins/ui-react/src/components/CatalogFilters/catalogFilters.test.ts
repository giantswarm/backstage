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
  it('draws only the facets that can narrow the catalog', () => {
    // One model for all has nothing to choose: no dropdown.
    const dimensions = catalogFilterDimensions(items, items, facets, {});
    expect(dimensions.map(dimension => dimension.id)).toEqual([
      'repo',
      'usage',
    ]);
  });

  it('leaves out one value the other items lack, as one not read yet', () => {
    // One organization while the rest of the fleet loads: nothing to choose.
    const some = items.map((item, index) => ({
      ...item,
      model: index === 0 ? 'opus' : undefined,
    }));
    expect(
      catalogFilterDimensions(some, some, facets, {}).map(
        dimension => dimension.id,
      ),
    ).toEqual(['repo', 'usage']);
  });

  it('draws two values among the items that have one, the rest without', () => {
    const mixed = items.map((item, index) => ({
      ...item,
      model: ['opus', 'sonnet', undefined][index],
    }));
    const [model] = catalogFilterDimensions(mixed, mixed, facets, {}).filter(
      dimension => dimension.id === 'model',
    );
    expect(model.options.map(option => option.id)).toEqual(['opus', 'sonnet']);
  });

  it('draws one value some items lack where a missing value is a choice, as Favorites', () => {
    const starred: CatalogFacet<Item> = {
      id: 'favorites',
      label: 'Favorites',
      value: item => (item.name === 'a' ? 'starred' : undefined),
      missingIsChoice: true,
    };
    const [favorites] = catalogFilterDimensions(items, items, [starred], {});
    expect(favorites.options).toEqual([
      { id: 'starred', label: 'starred', count: 1 },
    ]);
  });

  it('leaves out a flag every item has', () => {
    const everyone: CatalogFacet<Item> = {
      id: 'favorites',
      label: 'Favorites',
      value: () => 'starred',
      missingIsChoice: true,
    };
    expect(catalogFilterDimensions(items, items, [everyone], {})).toEqual([]);
  });

  it('keeps a facet of one value while it is picked, so it can be undone', () => {
    expect(
      catalogFilterDimensions(items, items, facets, { model: ['opus'] }).map(
        dimension => dimension.id,
      ),
    ).toEqual(['repo', 'usage', 'model']);
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

describe('a facet with several values per item', () => {
  type Tagged = { name: string; tags: string[]; repo: string };
  const tagged: Tagged[] = [
    { name: 'a', tags: ['util', 'ops'], repo: 'x' },
    { name: 'b', tags: ['util'], repo: 'y' },
    { name: 'c', tags: [], repo: 'x' },
    { name: 'd', tags: ['marketing', 'marketing'], repo: 'y' },
  ];
  const tagFacets: CatalogFacet<Tagged>[] = [
    { id: 'tags', label: 'Tags', value: item => item.tags },
    { id: 'repo', label: 'Source', value: item => item.repo },
  ];

  it('keeps an item when any of its values is picked', () => {
    expect(
      applyCatalogFilters(tagged, tagFacets, {
        tags: ['ops', 'marketing'],
      }).map(item => item.name),
    ).toEqual(['a', 'd']);
    expect(
      applyCatalogFilters(tagged, tagFacets, {
        tags: ['util'],
        repo: ['y'],
      }).map(item => item.name),
    ).toEqual(['b']);
  });

  it('counts an item under each of its values, once per value', () => {
    const [tags, repo] = catalogFilterDimensions(tagged, tagged, tagFacets, {});
    expect(tags.options).toEqual([
      { id: 'util', label: 'util', count: 2 },
      { id: 'marketing', label: 'marketing', count: 1 },
      { id: 'ops', label: 'ops', count: 1 },
    ]);
    expect(repo.options.map(option => option.count)).toEqual([2, 2]);
  });

  it('counts other facets over the items any picked value keeps', () => {
    const [, repo] = catalogFilterDimensions(tagged, tagged, tagFacets, {
      tags: ['util'],
    });
    expect(repo.options.map(option => [option.id, option.count])).toEqual([
      ['x', 1],
      ['y', 1],
    ]);
  });

  const drawn = (rows: Tagged[]) =>
    catalogFilterDimensions(rows, rows, tagFacets, {}).map(
      dimension => dimension.id,
    );

  it('leaves the facet out when every item has the same values', () => {
    const same = tagged.map(item => ({ ...item, tags: ['a', 'b'] }));
    expect(drawn(same)).toEqual(['repo']);
  });

  it('draws the facet when a value is not on every item', () => {
    const some = tagged.map((item, index) => ({
      ...item,
      tags: index === 0 ? ['a'] : ['a', 'b'],
    }));
    expect(drawn(some)).toEqual(['tags', 'repo']);
  });

  it('counts an empty list as no value', () => {
    // One value, the rest without: nothing to choose unless missing is one.
    const one = tagged.map((item, index) => ({
      ...item,
      tags: index === 0 ? ['a'] : [],
    }));
    expect(drawn(one)).toEqual(['repo']);
  });

  it('leaves the facet out when no item has a value', () => {
    const none = tagged.map(item => ({ ...item, tags: [] }));
    expect(
      catalogFilterDimensions(none, none, tagFacets, {}).map(
        dimension => dimension.id,
      ),
    ).toEqual(['repo']);
  });
});
