import { applyCatalogFilters, catalogFilterDimensions } from './catalogFilters';
import { tagsFacet } from './tagsFacet';

describe('tagsFacet', () => {
  it('keeps the items carrying any picked tag', () => {
    const items = [
      { name: 'a', tags: ['util', 'ops'] },
      { name: 'b', tags: ['marketing'] },
      { name: 'c', tags: [] },
    ];
    const facet = tagsFacet((item: (typeof items)[number]) => item.tags);

    expect(facet).toMatchObject({ id: 'tags', label: 'Tags' });
    expect(
      applyCatalogFilters(items, [facet], { tags: ['ops', 'marketing'] }).map(
        item => item.name,
      ),
    ).toEqual(['a', 'b']);
  });

  it('draws one tag that some items lack, untagged being a choice', () => {
    const items = [
      { name: 'a', tags: ['ops'] },
      { name: 'b', tags: [] },
    ];
    const facet = tagsFacet((item: (typeof items)[number]) => item.tags);

    expect(catalogFilterDimensions(items, items, [facet], {})).toEqual([
      {
        id: 'tags',
        label: 'Tags',
        options: [{ id: 'ops', label: 'ops', count: 1 }],
        selected: [],
      },
    ]);
  });

  it('draws a tag that some tagged items lack', () => {
    const items = [
      { name: 'a', tags: ['a'] },
      { name: 'b', tags: ['a', 'b'] },
    ];
    const facet = tagsFacet((item: (typeof items)[number]) => item.tags);

    expect(
      catalogFilterDimensions(items, items, [facet], {}).map(
        dimension => dimension.id,
      ),
    ).toEqual(['tags']);
  });

  it('leaves out tags every item carries', () => {
    const items = [
      { name: 'a', tags: ['a', 'b'] },
      { name: 'b', tags: ['b', 'a'] },
    ];
    const facet = tagsFacet((item: (typeof items)[number]) => item.tags);

    expect(catalogFilterDimensions(items, items, [facet], {})).toEqual([]);
  });
});
